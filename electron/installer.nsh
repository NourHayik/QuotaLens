; QuotaLens NSIS custom script
; Automatically adds QuotaLens to User PATH on install and cleans it up on uninstall natively in Windows Registry

!macro customInstall
  ; Read current User PATH from registry
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCmp $0 "" empty not_empty
  empty:
    WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
    Goto notify
  not_empty:
    ; Append $INSTDIR to User PATH
    WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
  notify:
    ; Broadcast environment change notification to all windows
    SendMessage 0xFFFF 0x001A 0 "STR:Environment" /TIMEOUT=2000
!macroend

!macro customUnInstall
  ; Notify system of environment change
  SendMessage 0xFFFF 0x001A 0 "STR:Environment" /TIMEOUT=2000
!macroend
