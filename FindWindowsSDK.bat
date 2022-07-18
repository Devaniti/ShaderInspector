@echo off
setlocal enableDelayedExpansion

for /F "tokens=1,2*" %%i in ('reg query "HKLM\SOFTWARE\Wow6432Node\Microsoft\Microsoft SDKs\Windows\v10.0" /v "InstallationFolder"') DO (
    if "%%i"=="InstallationFolder" (
        SET WindowsSdkDir=%%~k
    )
)

for /f %%i IN ('dir "%WindowsSdkDir%include\" /b /ad-h /on') DO (
	set result=%%i
	if "!result:~0,3!"=="10." (
		set SDK=!result!
	)
)

echo %WindowsSdkDir%bin\%SDK%\
