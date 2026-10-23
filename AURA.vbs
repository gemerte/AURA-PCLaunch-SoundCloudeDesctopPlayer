Option Explicit
Dim fso, sh, dir, exe, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\node_modules\electron\dist\electron.exe"
If Not fso.FileExists(exe) Then
  MsgBox "Electron не найден:" & vbCrLf & exe & vbCrLf & vbCrLf & "Установите зависимости: npm install", vbExclamation, "AURA"
  WScript.Quit 1
End If
sh.CurrentDirectory = dir
cmd = """" & exe & """ """ & dir & """"
sh.Run cmd, 0, False
