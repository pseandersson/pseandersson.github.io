@echo off
set ACTIVE_CODE_PAGE=
set HEADER=
set SKIP_HEADER=0
set WRITING_MODE=^^^>^^^>
set OUTPUT=
set INPUT_FILE=%~f1
set OUTPUT_FILE=%INPUT_FILE:~0,-3%js

echo %INPUT_FILE% -^> %OUTPUT_FILE%
set CURRENT_LINE=

set WRITE_TO_FILE=%WRITING_MODE%"%OUTPUT_FILE%"

for /f "delims=:  tokens=2" %%i in ('chcp') do (
    set ACTIVE_CODE_PAGE=%%~i
)
chcp 1252 >nul

if exist %OUTPUT_FILE% (
    set SKIP_HEADER=1
) ELSE (
    %OUTPUT% echo|set /P=>%OUTPUT_FILE%
)

set /a ROWS_TO_SKIP=1
set HEADER=

for /f "delims=" %%I in (%INPUT_FILE%) do (
    call :check_header %%I
)
:continue

@REM echo Rows to skip %ROWS_TO_SKIP%
@REM echo %HEADER%

set /a rows=0

if %SKIP_HEADER%==0 (
    call :write_line localFile.header^(^)
    for /f "delims=, tokens=*" %%i in (""%HEADER:,=","%"") do (
        echo:|set /p=.
        call :write_line_begin
        call :parserow %%i
        call :write_line_end
    )
)

for /f "skip=%ROWS_TO_SKIP% delims=, tokens=*" %%i in (%INPUT_FILE%) do (
    echo:|set /p=.
    call :write_line_begin
    call :parserow %%i
    call :write_line_end
)
echo:

@REM Change to UTF-8
chcp 65001>nul
for /L %%i in (1,1,%rows%) do (
    call echo %%LINE_%%i%%>>%OUTPUT_FILE%
    call set %%LINE_%%i%%=
)
echo Parsed %rows% rows
chcp %ACTIVE_CODE_PAGE% >nul
goto :eof

:check_header
set _test_header=%*
if '%_test_header:~0,1%'=='*' (
    set /a ROWS_TO_SKIP+=1
    goto :eof
)
if "%HEADER%"=="" set HEADER=%_test_header%
goto :eof

:parserow
SHIFT
for %%i in (%*) do (
    call :write_cell %%i
)
goto :eof

:write_cell
IF "%~1"==%1 goto :write_string

echo|set /p=%1|findstr /R "^[-0-9][0-9]*\.*[0-9]*$" >nul
IF %errorlevel%==0 (
    call :write_number %1
    goto :eof
)
IF %1==0 (
    call :write_number %1
    goto :eof
)
IF %1==1 (
    call :write_number %1
    goto :eof
)
IF %1==2 (
    call :write_number %1
    goto :eof
)
IF %1==3 (
    call :write_number %1
    goto :eof
)
IF %1==4 (
    call :write_number %1
    goto :eof
)
IF %1==5 (
    call :write_number %1
    goto :eof
)
IF %1==6 (
    call :write_number %1
    goto :eof
)
IF %1==7 (
    call :write_number %1
    goto :eof
)
IF %1==8 (
    call :write_number %1
    goto :eof
)
IF %1==9 (
    call :write_number %1
    goto :eof
)

echo|set /p=%1|findstr /R "^[1-2][09][0-9][0-9]\-[01][0-9]\-[0-3][0-9]$" >nul
IF %errorlevel%==0 (
    call :write_date %~1
    goto :eof
)
:write_string
call set LINE_%rows%=%%LINE_%rows%%%"%~1",
goto :eof

:write_line
%OUTPUT% echo %* %WRITE_TO_FILE%
goto :eof

:write_line_begin
set /a rows+=1
set LINE_%rows%=
goto :eof

:write_line_end
call set LINE_%rows%=^(^[%%LINE_%rows%:~0,-1%%^]^)
goto :eof

:write_number
call set LINE_%rows%=%%LINE_%rows%%%%~1,
goto :eof

:write_date
call set LINE_%rows%=%%LINE_%rows%%%"%~1T00:00:00.000Z",
goto :eof

