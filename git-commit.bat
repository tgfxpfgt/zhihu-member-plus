@echo off
chcp 65001 >nul
echo ========================================
echo   知乎盐选会员增强助手 - Git 自动提交
echo ========================================
echo.

cd /d "%~dp0"

set GIT_EXE=F:\app\Git\cmd\git.exe

if not exist "%GIT_EXE%" (
    echo [错误] 未找到 Git，请确认 F:\app\Git 目录存在
    pause
    exit /b 1
)

if not exist ".git" (
    echo [1/4] 初始化 Git 仓库...
    "%GIT_EXE%" init
    "%GIT_EXE%" config --local user.email "user@local.dev"
    "%GIT_EXE%" config --local user.name "ZMP-Dev"
    echo.
)

echo [2/4] 添加所有文件...
"%GIT_EXE%" add -A
echo.

echo [3/4] 提交代码...
"%GIT_EXE%" commit -m "update: %date% %time%"
echo.

echo [4/4] 推送到 GitHub...
"%GIT_EXE%" push origin master 2>nul
if %errorlevel% equ 0 (
    echo       推送成功！
) else (
    echo       推送跳过（未配置远程仓库或网络不可用）
)
echo.

echo ========================================
echo   完成！
echo ========================================
pause
