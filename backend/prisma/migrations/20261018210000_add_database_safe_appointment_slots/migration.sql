-- Normalize historical appointment slots before enforcing one active booking per slot.
-- The preflight aborts without changing data if any row cannot be normalized or if
-- existing PENDING/CONFIRMED appointments map to the same doctor/date/start time.
DO $$
DECLARE
  appointment_row RECORD;
  normalized_date DATE;
  normalized_time TEXT;
  time_parts TEXT[];
  hour_24 INTEGER;
  end_hour_24 INTEGER;
  active_keys TEXT[] := ARRAY[]::TEXT[];
  invalid_count INTEGER := 0;
  duplicate_count INTEGER := 0;
  slot_key TEXT;
BEGIN
  FOR appointment_row IN
    SELECT "doctorId", "preferredDate", "preferredTime", "status"
    FROM "appointments"
  LOOP
    normalized_date := NULL;
    normalized_time := NULL;

    BEGIN
      IF appointment_row."preferredDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        normalized_date := appointment_row."preferredDate"::DATE;
        IF to_char(normalized_date, 'YYYY-MM-DD') <> appointment_row."preferredDate" THEN
          normalized_date := NULL;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      normalized_date := NULL;
    END;

    IF appointment_row."preferredTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      normalized_time := appointment_row."preferredTime";
    ELSE
      time_parts := regexp_match(
        appointment_row."preferredTime",
        '^(1[0-2]|[1-9]):([0-5][0-9]) (AM|PM) - (1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$',
        'i'
      );
      IF time_parts IS NOT NULL THEN
        hour_24 := (time_parts[1]::INTEGER % 12) +
          CASE WHEN upper(time_parts[3]) = 'PM' THEN 12 ELSE 0 END;
        end_hour_24 := (time_parts[4]::INTEGER % 12) +
          CASE WHEN upper(time_parts[6]) = 'PM' THEN 12 ELSE 0 END;
        IF end_hour_24 * 60 + time_parts[5]::INTEGER > hour_24 * 60 + time_parts[2]::INTEGER THEN
          normalized_time := lpad(hour_24::TEXT, 2, '0') || ':' || time_parts[2];
        END IF;
      END IF;
    END IF;

    IF normalized_date IS NULL OR normalized_time IS NULL THEN
      invalid_count := invalid_count + 1;
    ELSIF appointment_row."status" IN ('PENDING', 'CONFIRMED') THEN
      slot_key := appointment_row."doctorId" || '|' ||
        normalized_date::TEXT || '|' || normalized_time;
      IF slot_key = ANY(active_keys) THEN
        duplicate_count := duplicate_count + 1;
      ELSE
        active_keys := array_append(active_keys, slot_key);
      END IF;
    END IF;
  END LOOP;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION
      'Appointment slot migration stopped: % appointment record(s) cannot be normalized. Reconcile records explicitly before retrying.',
      invalid_count;
  END IF;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Appointment slot migration stopped: % duplicate active slot(s) exist. Reconcile records explicitly before retrying.',
      duplicate_count;
  END IF;
END $$;

ALTER TABLE "appointments"
  ADD COLUMN "appointmentDate" DATE,
  ADD COLUMN "slotStart" VARCHAR(5);

UPDATE "appointments"
SET
  "appointmentDate" = "preferredDate"::DATE,
  "slotStart" = CASE
    WHEN "preferredTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN "preferredTime"
    ELSE lpad(
      (
        (regexp_match(
          "preferredTime",
          '^(1[0-2]|[1-9]):([0-5][0-9]) (AM|PM) - (1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$',
          'i'
        ))[1]::INTEGER % 12 +
        CASE WHEN upper((regexp_match(
          "preferredTime",
          '^(1[0-2]|[1-9]):([0-5][0-9]) (AM|PM) - (1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$',
          'i'
        ))[3]) = 'PM' THEN 12 ELSE 0 END
      )::TEXT,
      2,
      '0'
    ) || ':' || (regexp_match(
      "preferredTime",
      '^(1[0-2]|[1-9]):([0-5][0-9]) (AM|PM) - (1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$',
      'i'
    ))[2]
  END;

ALTER TABLE "appointments"
  ALTER COLUMN "appointmentDate" SET NOT NULL,
  ALTER COLUMN "slotStart" SET NOT NULL;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_slotStart_format_check"
  CHECK ("slotStart" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

CREATE UNIQUE INDEX "appointments_active_slot_key"
  ON "appointments"("doctorId", "appointmentDate", "slotStart")
  WHERE "status" IN ('PENDING', 'CONFIRMED');
