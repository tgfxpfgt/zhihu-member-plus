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
    echo [1/3] 初始化 Git 仓库...
    "%GIT_EXE%" init
    "%GIT_EXE%" config --local user.email "user@local.dev"
    "%GIT_EXE%" config --local user.name "ZMP-Dev"
    echo.
)

echo [2/3] 添加所有文件...
"%GIT_EXE%" add -A
echo.

echo [3/3] 提交代码...
"%GIT_EXE%" commit -m "update: %date% %time%"
echo.

echo ========================================
echo   提交完成！
echo ========================================
pause
