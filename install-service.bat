@echo off
:: 用管理员权限运行：注册 Windows 计划任务，开机自启导师管理系统
:: 完成后在任务计划程序里可以看到 "MentorManagement" 任务

setlocal
set TASK_NAME=MentorManagement
set PROJECT_DIR=E:\Project coding\mentor-management-system
set NODE_PATH=node

:: 先尝试删除已有任务（静默）
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: 注册开机自启任务，以当前用户身份运行
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%NODE_PATH%\" \"%PROJECT_DIR%\server\index.js\"" ^
  /sc onlogon ^
  /rl highest ^
  /f

if %errorlevel% equ 0 (
    echo.
    echo [OK] 计划任务 "%TASK_NAME%" 已注册
    echo     触发: 每次登录 Windows 时自动启动
    echo     命令: node %PROJECT_DIR%\server\index.js
    echo.
    echo 手动管理:
    echo   schtasks /query /tn %TASK_NAME%    (查看)
    echo   schtasks /delete /tn %TASK_NAME% /f (删除)
    echo   schtasks /run  /tn %TASK_NAME%      (手动触发)
) else (
    echo [ERROR] 注册失败，请以管理员权限运行此脚本
)

pause
