; QuotaLens NSIS custom script
; Automatically adds QuotaLens to User PATH on install and cleans it up on uninstall using native Windows PowerShell

!macro customInstall
  ExecWait 'powershell -NoProfile -WindowStyle Hidden -Command "$$d=\"$INSTDIR\"; $$p=[Environment]::GetEnvironmentVariable(\"PATH\",\"User\"); if($$p -notlike \"*$$d*\"){[Environment]::SetEnvironmentVariable(\"PATH\",\"$$p;$$d\",\"User\")}"'
!macroend

!macro customUnInstall
  ExecWait 'powershell -NoProfile -WindowStyle Hidden -Command "$$d=\"$INSTDIR\"; $$p=[Environment]::GetEnvironmentVariable(\"PATH\",\"User\"); if($$p -like \"*$$d*\"){[Environment]::SetEnvironmentVariable(\"PATH\",($$p -replace [regex]::Escape(\";$$d\"), \"\" -replace [regex]::Escape(\"$$d;\"), \"\"),\"User\")}"'
!macroend
