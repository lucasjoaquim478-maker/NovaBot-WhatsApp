$wsh = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$project = Split-Path -Parent $PSCommandPath

# Create shortcut on desktop
$lnk = $wsh.CreateShortcut("$desktop\NovaBot.lnk")
$lnk.TargetPath = "$project\start.bat"
$lnk.WorkingDirectory = "$project"
$lnk.Description = "NovaBot WhatsApp - Premium"
$lnk.IconLocation = "$project\robot.ico"
$lnk.WindowStyle = 1
$lnk.Save()

Write-Host "Atalho criado na Area de Trabalho: $desktop\NovaBot.lnk"
