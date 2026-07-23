@echo off
chcp 65001 >nul
echo ========================================
echo   知乎盐选会员增强助手 - Git 初始化
echo ========================================
echo.

cd /d "%~dp0"

git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Git，请先安装 Git for Windows:
    echo         https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

if not exist ".git" (
    echo [1/3] 初始化 Git 仓库...
    git init
    echo.
)

echo [2/3] 添加所有文件...
git add -A
echo.

echo [3/3] 提交代码...
git commit -m "feat: 知乎盐选会员增强助手 - bug修复+性能优化完成版"
echo.

echo ========================================
echo   完成！后续每次修改后运行此脚本即可自动提交
echo ========================================
pause
