import datetime
import logging
import os
import shutil
import threading
from enum import Enum
from json import loads

from filelock import FileLock
from flask import request
from flask_socketio import emit

# Copy default environment if it exists
CURRENT_DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ENVIRONMENT_PATH = os.path.join(
    CURRENT_DIRECTORY, "../../../default-environment.json"
)
ENVIRONMENT_PATH = os.path.join(CURRENT_DIRECTORY, "environment.json")

if os.path.exists(DEFAULT_ENVIRONMENT_PATH):
    shutil.copy(DEFAULT_ENVIRONMENT_PATH, ENVIRONMENT_PATH)


# Load environment variables from environment.json
def load_environment(path: str, previous_environment: dict) -> dict:
    if not os.path.exists(path):
        return previous_environment

    lock = FileLock(f"{path}.lock")

    with lock:
        with open(path) as environment_file:
            content = loads("\n".join(environment_file.readlines()).replace("'", '"'))

            for key in content:
                previous_environment[key] = content[key]


environment = {}

load_environment(ENVIRONMENT_PATH, environment)
load_environment(os.path.join(os.getcwd(), "environment.json"), environment)

# Write environment into static folder
STATIC_ENVIRONMENT_PATH = os.path.join(
    CURRENT_DIRECTORY, "../ui/static/environment.json"
)
lock = FileLock(f"{STATIC_ENVIRONMENT_PATH}.lock")
with lock:
    with open(STATIC_ENVIRONMENT_PATH, "w") as static_environment_file:
        static_environment_file.write(
            "{\n  "
            + ",\n  ".join(
                [f'"{key}": "{value}"' for key, value in environment.items()]
            )
            + "\n}"
        )


HOST = str(environment["HOST"])
SERVER_PORT = int(environment["SERVER_PORT"])
CLIENT_PORT = int(environment["CLIENT_PORT"])

print(f"Server running on {HOST}:{SERVER_PORT} and client on {HOST}:{CLIENT_PORT}")

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


def get_data_directory_path(data: str | None = None) -> str:
    cwd = os.getcwd()
    data_directory = os.path.join(cwd, "data")

    if data is not None:
        data_directory = os.path.join(data_directory, data)

    return data_directory


def get_available_data():
    data_dir = get_data_directory_path()

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
