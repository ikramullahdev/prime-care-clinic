$ErrorActionPreference = 'Stop'

$helperPath = Join-Path $PSScriptRoot 'reset-dr-farhan-password.cjs'
$nodeCommand = Get-Command node -ErrorAction Stop
$securePassword = $null
$plainPassword = $null
$passwordPointer = [IntPtr]::Zero
$process = $null

try {
    if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
        throw 'The local password-reset helper was not found.'
    }

    $securePassword = Read-Host 'Enter a new password for Dr. Farhan (12 characters minimum; input is hidden)' -AsSecureString
    if ($securePassword.Length -lt 12) {
        throw 'Password must contain at least 12 characters. No account was changed.'
    }

    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

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
        throw 'Unable to start the local password-reset helper. No account was changed.'
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine($plainPassword)
    $process.StandardInput.Close()
    $process.WaitForExit()

    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    if ($stdout) {
        Write-Output $stdout.TrimEnd()
    }
    if ($stderr) {
        Write-Output $stderr.TrimEnd()
    }
    if ($process.ExitCode -ne 0) {
        throw 'Password reset failed. No success should be assumed; review the helper output and recheck the account.'
    }
}
finally {
    if ($process) {
        $process.Dispose()
    }
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($securePassword) {
        $securePassword.Dispose()
    }
    $plainPassword = $null
}
