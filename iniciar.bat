@echo off
chcp 65001 >nul
title RedTec - Sistema de Gestion de Inventario y Prestamos
color 0B

cd /d "%~dp0"

echo =====================================================================
echo           BIENVENIDO A REDTEC - SISTEMA COMUNITARIO
echo =====================================================================
echo.

if exist ".env" goto env_ready
if not exist ".env.example" goto missing_env_example
echo [!] No se encontro .env. Creando desde .env.example...
copy /y .env.example .env >nul
if errorlevel 1 goto env_copy_failed
echo [OK] Archivo .env generado. Revise sus credenciales antes de continuar.

:env_ready
if exist "node_modules" goto dependencies_ready
echo.
echo [*] Instalando dependencias necesarias...
call npm install
if errorlevel 1 goto dependency_install_failed

:dependencies_ready
echo.
echo =====================================================================
echo   SELECCIONA UNA OPCION:
echo =====================================================================
echo   [1] Preparar todo (MySQL Docker, migraciones, datos y servidor)
echo   [2] Reiniciar base de datos (ELIMINA los datos actuales)
echo   [3] Ejecutar pruebas de integracion
echo   [4] Iniciar servidor usando MySQL local ya configurado
echo   [5] Iniciar MySQL con Docker
echo   [0] Salir
echo =====================================================================
echo.
choice /c 123450 /n /m "Selecciona una opcion: "
if errorlevel 6 goto exit_success
if errorlevel 5 goto start_mysql
if errorlevel 4 goto start_local
if errorlevel 3 goto run_tests
if errorlevel 2 goto reset_db
if errorlevel 1 goto start_all
goto exit_success

:start_all
call :start_docker
if errorlevel 1 goto failed
call npm run db:setup
if errorlevel 1 goto database_setup_failed
call :start_server
goto exit_success

:reset_db
echo.
echo [!] Esta opcion elimina las tablas y vuelve a cargar los datos de demostracion.
choice /c SN /n /m "Confirma reiniciar la base de datos? [S/N]: "
if errorlevel 2 goto exit_success
call :start_docker
if errorlevel 1 goto failed
call npm run db:reset
if errorlevel 1 goto database_setup_failed
call :start_server
goto exit_success

:run_tests
call npm test
if errorlevel 1 goto failed
echo.
echo [OK] Las pruebas terminaron correctamente.
goto exit_success

:start_local
call npm run dev
if errorlevel 1 goto failed
goto exit_success

:start_mysql
call :start_docker
if errorlevel 1 goto failed
echo [OK] MySQL esta disponible. Ejecuta la opcion 1 para preparar y abrir la aplicacion.
goto exit_success

:start_docker
where docker >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker no esta instalado. Instala e inicia Docker Desktop.
    exit /b 1
)
findstr /b /c:"DB_USER=root" .env >nul
if errorlevel 1 (
    echo [ERROR] El MySQL de Docker usa la cuenta root. Configure DB_USER=root en .env.
    exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
    echo [ERROR] El motor de Docker no esta disponible.
    echo Inicia Docker Desktop y espera a que indique "Engine running", luego vuelve a intentarlo.
    exit /b 1
)
echo.
echo [*] Iniciando MySQL con Docker...
docker compose up -d --wait mysql
if errorlevel 1 (
    echo [ERROR] No se pudo iniciar MySQL. Verifica Docker y el puerto configurado en .env.
    exit /b 1
)
exit /b 0

:start_server
echo.
echo [OK] Base de datos lista. Abriendo la aplicacion...
set "WEB_PORT=3000"
for /f "tokens=1,* delims==" %%A in ('findstr /b "PORT=" .env') do set "WEB_PORT=%%B"
start "" "http://localhost:%WEB_PORT%/index.html"
call npm run dev
if errorlevel 1 exit /b 1
exit /b 0

:missing_env_example
echo [ERROR] No existe .env ni .env.example en la carpeta del proyecto.
goto failed

:env_copy_failed
echo [ERROR] No se pudo crear .env desde .env.example.
goto failed

:dependency_install_failed
echo [ERROR] Fallo al instalar dependencias. Revisa Node.js, npm y la conexion.
goto failed

:database_setup_failed
echo.
echo [ERROR] No se pudo preparar la base de datos.
echo Revisa el archivo .env y que MySQL este disponible; no se informara como exito.
goto failed

:failed
echo.
pause
exit /b 1

:exit_success
exit /b 0
