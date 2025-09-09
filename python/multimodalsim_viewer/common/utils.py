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

    @property
    def number_of_updates_between_states(self) -> int:
        return int(environment.get("NUMBER_OF_UPDATES_BETWEEN_STATES"))

    @property
    def number_of_states_to_send_at_once(self) -> int:
        return int(environment.get("NUMBER_OF_STATES_TO_SEND_AT_ONCE"))


_environment = _Environment()
SERVER_PORT = _environment.server_port
CLIENT_PORT = _environment.client_port
HOST = _environment.host
SIMULATION_SAVE_FILE_SEPARATOR = _environment.simulation_save_file_separator
INPUT_DATA_DIRECTORY_PATH = _environment.input_data_directory_path
NUMBER_OF_UPDATES_BETWEEN_STATES = _environment.number_of_updates_between_states
NUMBER_OF_STATES_TO_SEND_AT_ONCE = _environment.number_of_states_to_send_at_once


CLIENT_ROOM = "client"
SIMULATION_ROOM = "simulation"
SCRIPT_ROOM = "script"

# If the version is identical, the save file can be loaded
SAVE_VERSION = 12


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
