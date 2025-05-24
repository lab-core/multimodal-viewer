import threading
import time

import requests
from multimodalsim_viewer.server.server import run_server
from multimodalsim_viewer.server.server_utils import CLIENT_PORT, HOST, PORT
from multimodalsim_viewer.ui.cli import main as run_ui
from socketio import Client, exceptions


def run_server_and_ui():
    # Start the server in a separate thread
    server_thread = threading.Thread(target=run_server)
    server_thread.start()

    # Start the UI in a separate thread
    ui_thread = threading.Thread(target=run_ui)
    ui_thread.start()

    # Wait for both threads to finish
    server_thread.join()
    ui_thread.join()


def terminate_server():
    print("Terminating server...")

    sio = Client()

    try:
        sio.connect(f"http://{HOST}:{PORT}", auth={"type": "script"})

        sio.emit("terminate")

        time.sleep(1)

        sio.disconnect()

        print("Server terminated")

    except exceptions.ConnectionError as e:
        print(f"Failed to connect to server (server not running?): {e}")

    except Exception as e:
        print(f"Error: {e}")


def terminate_ui():
    print("Terminating UI...")

    try:
        response = requests.get(f"http://{HOST}:{CLIENT_PORT}/terminate")

        if response.status_code == 200:
            print("UI terminated")
        else:
            print(f"Failed to terminate UI: {response.status_code}")

    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")

    except Exception as e:
        print(f"Error: {e}")


def terminate_all():
    print("Terminating all...")

    terminate_server()
    terminate_ui()

    print("All terminated")
