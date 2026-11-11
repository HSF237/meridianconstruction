@echo off
python "C:\Users\HI\Desktop\MY CODESPACE\meridiahn construction\apply_bank_feature.py"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Script failed with code %ERRORLEVEL%
    pause
) else (
    echo SUCCESS: index.html updated!
    pause
)
