import os
import platform
import subprocess
import sys
from pathlib import Path

def launch_multimodal_ui(venv_path: Path, server_path: Path):
    """Launch multimodal-ui and server in separate terminals."""
    system = platform.system().lower()
    is_windows = system == "windows"
    is_mac = system == "darwin"
    is_linux = system == "linux"

    # Set Python executable path for the server
    python_exec = venv_path / "Scripts" / "python.exe" if is_windows else venv_path / "bin" / "python"

    if not server_path.exists():
        print(f"Error: Server script not found at {server_path}")
        sys.exit(1)

    try:
        if is_windows:
            # Windows implementation
            def create_windows_terminal(command, title):
                return f'start "{title}" cmd /k "{command}"'
            
            # Launch multimodal-ui directly (no Python needed)
            subprocess.Popen(
                create_windows_terminal("multimodal-ui", "Multimodal UI"),
                shell=True
            )
            
            # Launch server with venv Python
            server_cmd = f'"{python_exec}" "{server_path}"'
            subprocess.Popen(
                create_windows_terminal(server_cmd, "Multimodal Server"),
                shell=True
            )
            
        elif is_mac:
            # macOS implementation
            applescript = '''
            tell application "Terminal"
                do script "multimodal-ui"
                activate
                tell application "System Events" to keystroke "t" using command down
                do script "{} \"{}\"" in front window
            end tell
            '''.format(python_exec, server_path)
            subprocess.Popen(['osascript', '-e', applescript.strip()])
            
        else:
            # Linux implementation
            terminals = ['gnome-terminal', 'konsole', 'xterm', 'xfce4-terminal']
            for terminal in terminals:
                try:
                    # Launch in split terminals if possible
                    subprocess.Popen([terminal, '--', 'bash', '-c', 'multimodal-ui;'])
                    subprocess.Popen([terminal, '--', 'bash', '-c', f'"{python_exec}" "{server_path}"'])
                    break
                except FileNotFoundError:
                    continue

    except Exception as e:
        print(f"Failed to launch: {e}")
        sys.exit(1)

def main():
    project_root = Path(__file__).parent.resolve()
    venv_path = project_root / "venv"
    server_path = project_root / "multimodal-server" / "server.py"
    
    if not venv_path.exists():
        print(f"Error: Virtual environment not found at {venv_path}")
        sys.exit(1)
    
    launch_multimodal_ui(venv_path, server_path)

if __name__ == "__main__":
    main()