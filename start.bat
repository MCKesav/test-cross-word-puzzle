@echo off
echo ========================================
echo   Crossword Puzzle Generator
echo   Starting local servers...
echo ========================================
echo.

:: Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Install backend dependencies if needed
echo [1/4] Checking backend dependencies...
cd /d "%~dp0backend"
if not exist "node_modules" (
    echo Installing backend dependencies...
    call npm install
)

:: Start backend server in new window
echo [2/4] Starting backend server on port 3000...
start "Crossword Backend" cmd /k "cd /d %~dp0backend && npm run dev"

:: Wait a moment for backend to start
timeout /t 3 /nobreak >nul

:: Start frontend server in new window  
echo [3/4] Starting frontend server on port 5000...
start "Crossword Frontend" cmd /k "cd /d %~dp0 && npx -y serve frontend -l 5000"

:: Wait for frontend to start
timeout /t 2 /nobreak >nul

:: Open browser
echo [4/4] Opening browser...
start http://localhost:5000

echo.
echo ========================================
echo   Servers are running!
echo   Backend:  http://localhost:3000
echo   Frontend: http://localhost:5000
echo ========================================
echo.
echo Press any key to stop all servers...
pause >nul

:: Kill the server processes
taskkill /FI "WINDOWTITLE eq Crossword Backend*" /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Crossword Frontend*" /F >nul 2>nul

echo Servers stopped.
