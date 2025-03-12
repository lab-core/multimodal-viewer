import logging
from enum import Enum

from flask import request
from flask_socketio import emit

HOST = "127.0.0.1"
PORT = 5000

CLIENT_ROOM = "client"
SIMULATION_ROOM = "simulation"
SCRIPT_ROOM = "script"

# Save the state of the simulation every 500 events
STATE_SAVE_STEP = 100

# If the version is identical, the save file can be loaded
SAVE_VERSION = 3

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


def get_session_id():
    return request.sid


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
