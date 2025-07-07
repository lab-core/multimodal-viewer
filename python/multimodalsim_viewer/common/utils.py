import datetime
import logging
import os
import shutil
import threading
from enum import Enum
from json import dumps

from dotenv import dotenv_values
from filelock import FileLock
from flask import request
from flask_socketio import emit

environment = {}


def load_environment() -> None:
    # Copy .env if it exists
    current_directory = os.path.dirname(os.path.abspath(__file__))
    default_environment_path = os.path.join(current_directory, "../../../.env")
    environment_path = os.path.join(current_directory, "environments/.env")

    if os.path.exists(default_environment_path):
        shutil.copy(default_environment_path, environment_path)

    # Load environment variables from .env
    def load_environment_file(path: str, previous_environment: dict) -> None:
        if not os.path.exists(path):
            return

        values = dotenv_values(path)
        for key in values:
            previous_environment[key] = values[key]

    # Load default environment
    load_environment_file(environment_path, environment)
    # Load environment from the current working directory
    load_environment_file(os.path.join(os.getcwd(), ".env"), environment)

    # Get host from docker if available and set it in environment
    environment["HOST"] = os.getenv("HOST", "127.0.0.1")

    # Write environment into static folder
    static_environment_path = os.path.join(current_directory, "../ui/static/environment.json")
    lock = FileLock(f"{static_environment_path}.lock")
    with lock:
        with open(static_environment_path, "w", encoding="utf-8") as static_environment_file:
            static_environment_file.write(dumps(environment, indent=2, separators=(",", ": "), sort_keys=True))


class _Environment:
    is_environment_loaded = False

    def __init__(self):
        if _Environment.is_environment_loaded:
            return

        load_environment()
        _Environment.is_environment_loaded = True
        print(f"Environment loaded {environment}")

    @property
    def server_port(self) -> int:
        return int(environment.get("SERVER_PORT"))

    @property
    def client_port(self) -> int:
        return int(environment.get("CLIENT_PORT"))

    @property
    def host(self) -> str:
        return environment.get("HOST")

    @property
    def simulation_save_file_separator(self) -> str:
        return environment.get("SIMULATION_SAVE_FILE_SEPARATOR")

    @property
    def input_data_directory_path(self) -> str:
        return environment.get("INPUT_DATA_DIRECTORY_PATH")


_environment = _Environment()
SERVER_PORT = _environment.server_port
CLIENT_PORT = _environment.client_port
HOST = _environment.host
SIMULATION_SAVE_FILE_SEPARATOR = _environment.simulation_save_file_separator
INPUT_DATA_DIRECTORY_PATH = _environment.input_data_directory_path


CLIENT_ROOM = "client"
SIMULATION_ROOM = "simulation"
SCRIPT_ROOM = "script"

# Save the state of the simulation every STATE_SAVE_STEP events
STATE_SAVE_STEP = 1000

# If the version is identical, the save file can be loaded
SAVE_VERSION = 9


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


def get_data_directory_path() -> str:
    current_file_path = os.path.abspath(__file__)
    current_file_dir = os.path.dirname(current_file_path)
    data_directory_path = os.path.join(current_file_dir, "..", "data")

    if not os.path.exists(data_directory_path):
        os.makedirs(data_directory_path)

    return data_directory_path


def get_saved_logs_directory_path() -> str:
    data_directory_path = get_data_directory_path()
    saved_logs_directory_path = os.path.join(data_directory_path, "saved_logs")

    if not os.path.exists(saved_logs_directory_path):
        os.makedirs(saved_logs_directory_path)

    return saved_logs_directory_path


def get_input_data_directory_path(data: str | None = None) -> str:
    input_data_directory = INPUT_DATA_DIRECTORY_PATH

    if data is not None:
        input_data_directory = os.path.join(input_data_directory, data)

    return input_data_directory


def get_available_data():
    input_data_directory = get_input_data_directory_path()

    if not os.path.exists(input_data_directory):
        return []

    # List all directories in the input data directory
    return [
        name
        for name in os.listdir(input_data_directory)
        if os.path.isdir(os.path.join(input_data_directory, name)) and not name.startswith(".")
    ]


def log(message: str, auth_type: str, level=logging.INFO, should_emit=True) -> None:
    if auth_type == "server":
        logging.log(level, "[%s] %s", auth_type, message)
        if should_emit:
            emit("log", f"{level} [{auth_type}] {message}", to=CLIENT_ROOM)
    else:
        logging.log(level, "[%s] %s %s", auth_type, get_session_id(), message)
        if should_emit:
            emit(
                "log",
                f"{level} [{auth_type}] {get_session_id()} {message}",
                to=CLIENT_ROOM,
            )


def verify_simulation_name(name: str | None) -> str | None:
    if name is None:
        return "Name is required"
    if len(name) < 3:
        return "Name must be at least 3 characters"
    if len(name) > 50:
        return "Name must be at most 50 characters"
    if name.count(SIMULATION_SAVE_FILE_SEPARATOR) > 0:
        return "Name must not contain three consecutive dashes"
    if any(char in name for char in ["/", "\\", ":", "*", "?", '"', "<", ">", "|"]):
        return (
            'The name muse not contain characters that might affect the file system (e.g. /, \\, :, *, ?, ", <, >, |)'
        )
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
