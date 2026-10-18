$ErrorActionPreference = 'Stop'

$helperPath = Join-Path $PSScriptRoot 'create-diagnostic-technician-accounts.cjs'
$nodeCommand = Get-Command node -ErrorAction Stop
$plainPasswords = @()
$process = $null
$payload = $null

function Read-ConfirmedPassword([string]$label) {
    $first = Read-Host "Enter $label password (12 characters minimum; input is hidden)" -AsSecureString
    $second = $null
    $firstPointer = [IntPtr]::Zero
    $secondPointer = [IntPtr]::Zero

    try {
        if ($first.Length -lt 12) {
            throw 'Passwords must contain at least 12 characters. No accounts were created.'
        }
        $second = Read-Host "Confirm $label password (input is hidden)" -AsSecureString
        if ($first.Length -ne $second.Length) {
            throw 'Password confirmation did not match. No accounts were created.'
        }

        $firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
        $secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
        $firstText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
        $secondText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)
        if (-not [string]::Equals($firstText, $secondText, [StringComparison]::Ordinal)) {
            throw 'Password confirmation did not match. No accounts were created.'
        }
        return $firstText
    }
    finally {
        if ($firstPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)
        }
        if ($secondPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)
        }
        if ($first) {
            $first.Dispose()
        }
        if ($second) {
            $second.Dispose()
        }
        $firstText = $null
        $secondText = $null
    }
}

try {
    if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
        throw 'The local account-creation helper was not found.'
    }

    $labEmail = (Read-Host 'Laboratory technician email').Trim().ToLowerInvariant()
    $radiologyEmail = (Read-Host 'Radiology technician email').Trim().ToLowerInvariant()
    $emailPattern = '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    if ($labEmail -notmatch $emailPattern -or $radiologyEmail -notmatch $emailPattern) {
        throw 'Enter a valid email for each account. No accounts were created.'
    }
    if ([string]::Equals($labEmail, $radiologyEmail, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The two accounts must use different emails. No accounts were created.'
    }

    $labPassword = Read-ConfirmedPassword 'Laboratory technician'
    $plainPasswords += $labPassword
    $radiologyPassword = Read-ConfirmedPassword 'Radiology technician'
    $plainPasswords += $radiologyPassword

    $entries = @(
        @{
            email = $labEmail
            name = 'Laboratory Technician'
            role = 'LAB_TECHNICIAN'
            password = $plainPasswords[0]
        },
        @{
            email = $radiologyEmail
            name = 'Radiology Technician'
            role = 'RADIOLOGY_TECHNICIAN'
            password = $plainPasswords[1]
        }
    )
    $payload = ConvertTo-Json -InputObject $entries -Compress

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodeCommand.Source
    $startInfo.Arguments = '"' + $helperPath + '"'
    $startInfo.WorkingDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Unable to start the local Node.js helper. No accounts were created.'
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($payload)
    $process.StandardInput.Close()
    $process.WaitForExit()

    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($stdout) {
        Write-Output $stdout.TrimEnd()
    }
    if ($process.ExitCode -ne 0) {
        if ($stderr) {
            throw $stderr.Trim()
        }
        throw 'Account creation failed. No credentials were logged.'
    }
}
finally {
    if ($process) {
        $process.Dispose()
    }
    for ($index = 0; $index -lt $plainPasswords.Count; $index++) {
        $plainPasswords[$index] = $null
    }
    if ($entries) {
        foreach ($entry in $entries) {
            $entry.password = $null
        }
    }
    $plainPasswords = $null
    $labPassword = $null
    $radiologyPassword = $null
    $entries = $null
    $payload = $null
}
