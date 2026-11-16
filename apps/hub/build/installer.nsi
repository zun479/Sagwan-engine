; Wiki Hub 설치 프로그램 (NSIS 3, 유니코드). GitHub Actions에서 makensis로 빌드한다.
;   makensis /DVERSION=0.1.0 /DVERNUM=0.1.0 installer.nsi
; 같은 폴더에 WikiHub.exe, icon.ico가 있어야 한다.

Unicode true
ManifestDPIAware true
!include "MUI2.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef VERNUM
  !define VERNUM "0.0.0"
!endif
!define APPNAME "Wiki Hub"
!define EXE "WikiHub.exe"
!define REGKEY "Software\WikiHub"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\WikiHub"

Name "${APPNAME}"
OutFile "WikiHub-Setup-${VERSION}.exe"
; 관리자 권한 없이 사용자 폴더에 설치 (경로는 바꿀 수 있음)
InstallDir "$LOCALAPPDATA\Programs\WikiHub"
InstallDirRegKey HKCU "${REGKEY}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Sagwan Engine · Wiki Hub ${VERSION}"

VIProductVersion "${VERNUM}.0"
VIAddVersionKey /LANG=0 "ProductName" "Wiki Hub"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "FileDescription" "Wiki Hub 설치 프로그램"
VIAddVersionKey /LANG=0 "CompanyName" "Sagwan Engine"
VIAddVersionKey /LANG=0 "LegalCopyright" "AGPL-3.0"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Wiki Hub ${VERSION} 설치"
!define MUI_WELCOMEPAGE_TEXT "Wiki Hub는 Sagwan Engine 위키를 내 클라우드에 배포하고, 서버·DB·도메인 만료일을 한눈에 보는 PC 프로그램입니다.$\r$\n$\r$\nWiki Hub에는 계정이 없습니다. 위키 데이터와 비밀번호는 이 PC나 Hub에 저장되지 않습니다.$\r$\n$\r$\n[다음]을 눌러 설치할 폴더를 고르세요."
!insertmacro MUI_PAGE_WELCOME

!define MUI_DIRECTORYPAGE_TEXT_TOP "Wiki Hub를 설치할 폴더입니다. 다른 곳에 설치하려면 [찾아보기]를 누르세요.$\r$\n(Program Files처럼 관리자 권한이 필요한 폴더는 고를 수 없습니다.)"
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE CheckDirWritable
!insertmacro MUI_PAGE_DIRECTORY

!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Wiki Hub 실행"
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "바탕화면에 바로가기 만들기"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Korean"

Function CheckDirWritable
  ClearErrors
  CreateDirectory "$INSTDIR"
  ClearErrors
  FileOpen $0 "$INSTDIR\.wikihub-write-test" w
  IfErrors 0 +3
    MessageBox MB_ICONEXCLAMATION|MB_OK "이 폴더에는 쓸 수 없습니다.$\r$\n관리자 권한이 필요 없는 다른 폴더를 골라 주세요.$\r$\n$\r$\n$INSTDIR"
    Abort
  FileClose $0
  Delete "$INSTDIR\.wikihub-write-test"
FunctionEnd

Function CreateDesktopShortcut
  CreateShortcut "$DESKTOP\Wiki Hub.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"
FunctionEnd

Section "Wiki Hub" SecMain
  SectionIn RO
  ; 실행 중이면 닫고 덮어쓴다 (업데이트 설치)
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  Pop $0
  Sleep 300

  SetOutPath "$INSTDIR"
  File "${EXE}"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortcut "$SMPROGRAMS\Wiki Hub.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"

  WriteRegStr HKCU "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Wiki Hub"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Sagwan Engine"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout" "https://github.com/zun479/Sagwan-engine"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  Pop $0
  Sleep 300

  ; 설치한 파일만 지운다. 사용자가 고른 폴더를 통째로 지우지 않는다.
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  Delete "$SMPROGRAMS\Wiki Hub.lnk"
  Delete "$DESKTOP\Wiki Hub.lnk"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "${REGKEY}"

  MessageBox MB_YESNO|MB_ICONQUESTION "Wiki Hub 설정(인프라 블록, 만료일 기록)도 지울까요?$\r$\n위키 사이트와 클라우드 서비스는 지워지지 않습니다." /SD IDNO IDNO keep
    RMDir /r "$APPDATA\WikiHub"
  keep:
SectionEnd
