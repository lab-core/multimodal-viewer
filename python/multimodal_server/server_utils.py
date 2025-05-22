import datetime
import logging
import os
import threading
from enum import Enum
from pathlib import Path

from dotenv import load_dotenv
from flask import request
from flask_socketio import emit

# Load environment variables from the root .env file
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)

HOST = os.getenv("SERVER_HOST", "127.0.0.1")
PORT = int(os.getenv("PORT_SERVER", "8089"))  # It will use .env or default to 8089

CLIENT_ROOM = "client"
SIMULATION_ROOM = "simulation"
SCRIPT_ROOM = "script"

# Save the state of the simulation every STATE_SAVE_STEP events
STATE_SAVE_STEP = 1000

# If the version is identical, the save file can be loaded
SAVE_VERSION = 9

SIMULATION_SAVE_FILE_SEPARATOR = "---"


class SimulationStatus(Enum):
    STARTING = "starting"
    PAUSED = "paused"
    RUNNING = "running"
    STOPPING = "stopping"
    COMPLETED = "completed"
    LOST = "lost"
    CORRUPTED = "corrupted"
    OUTDATED = "outdated"
    FUTURE = "future"


RUNNING_SIMULATION_STATUSES = [
    SimulationStatus.STARTING,
    SimulationStatus.RUNNING,
    SimulationStatus.PAUSED,
    SimulationStatus.STOPPING,
    SimulationStatus.LOST,
]


def get_session_id():
    return request.sid


def build_simulation_id(name: str) -> tuple[str, str]:
    # Get the current time
    start_time = datetime.datetime.now().strftime("%Y%m%d-%H%M%S%f")
    # Remove microseconds
    start_time = start_time[:-3]

    # Start time first to sort easily
    simulation_id = f"{start_time}{SIMULATION_SAVE_FILE_SEPARATOR}{name}"
    return simulation_id, start_time


def get_available_data():
    current_dir = os.path.dirname(os.path.realpath(__file__))
    data_dir = os.path.join(current_dir, "..", "..", "data")

    if not os.path.exists(data_dir):
        return []

    return os.listdir(data_dir)


def log(message: str, auth_type: str, level=logging.INFO, should_emit=True) -> None:
    if auth_type == "server":
        logging.log(level, f"[{auth_type}] {message}")
        if should_emit:
            emit("log", f"{level} [{auth_type}] {message}", to=CLIENT_ROOM)
    else:
        logging.log(level, f"[{auth_type}] {get_session_id()} {message}")
        if should_emit:
            emit(
                "log",
                f"{level} [{auth_type}] {get_session_id()} {message}",
                to=CLIENT_ROOM,
            )


def verify_simulation_name(name: str | None) -> str | None:
    if name is None:
        return "Name is required"
    elif len(name) < 3:
        return "Name must be at least 3 characters"
    elif len(name) > 50:
        return "Name must be at most 50 characters"
    elif name.count(SIMULATION_SAVE_FILE_SEPARATOR) > 0:
        return "Name must not contain three consecutive dashes"
    elif any(char in name for char in ["/", "\\", ":", "*", "?", '"', "<", ">", "|"]):
        return 'The name muse not contain characters that might affect the file system (e.g. /, \, :, *, ?, ", <, >, |)'
    return None


def set_event_on_input(action: str, key: str, event: threading.Event) -> None:
    try:
        user_input = ""
        while user_input != key:
            user_input = input(f"Press {key} to {action}: ")

    except EOFError:
        pass

    print(f"Received {key}: {action}")
    event.set()
