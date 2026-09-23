; QuotaLens NSIS custom script
; Automatically adds QuotaLens to User PATH on install and cleans it up on uninstall

!macro customInstall
  DetailPrint "Registering QuotaLens CLI into PATH..."
  ; Add $INSTDIR to User PATH in registry if not present
  ReadRegStr $0 HKCU "Environment" "Path"
  ${StrLoc} $1 $0 "$INSTDIR" ">"
  StrCmp $1 "" 0 +3
    WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
    SendMessage ${HWND_BROADCAST} 0x001A 0 "STR:Environment" /TIMEOUT=2000
!macroend

!macro customUnInstall
  DetailPrint "Unregistering QuotaLens CLI from PATH..."
  ReadRegStr $0 HKCU "Environment" "Path"
  ; Strip $INSTDIR;
  ${StrRep} $0 $0 "$INSTDIR;" ""
  ${StrRep} $0 $0 ";$INSTDIR" ""
  ${StrRep} $0 $0 "$INSTDIR" ""
  WriteRegExpandStr HKCU "Environment" "Path" "$0"
  SendMessage ${HWND_BROADCAST} 0x001A 0 "STR:Environment" /TIMEOUT=2000
!macroend
