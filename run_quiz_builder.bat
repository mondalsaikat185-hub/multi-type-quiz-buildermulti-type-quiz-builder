@echo off
echo =======================================================================
echo            STARTING QUIZ BUILDER LOCAL DEVELOPMENT SERVER
echo =======================================================================
echo.

:: Check if node_modules folder exists
if not exist "node_modules\" (
    echo [INFO] node_modules folder is missing. Installing dependencies...
    echo This may take a moment, please wait...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Please ensure Node.js is installed.
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Starting the background task to launch the browser...
:: Wait 3 seconds for the server to spin up, then open http://localhost:3000
start /B cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:3000"

echo [INFO] Starting the local host server...
call npm run dev

pause
