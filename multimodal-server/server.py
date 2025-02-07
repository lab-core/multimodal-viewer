import logging
import multiprocessing
import os
import time

from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms
from simulation import run_simulation

HOST = "127.0.0.1"
PORT = 5000

CLIENT_ROOM = "client"
SIMULATION_ROOM = "simulation"
SCRIPT_ROOM = "script"

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# key = session id, value = auth type
sockets_types_by_session_id = dict()

simulation_process_by_name = dict()
simulation_session_id_by_name = dict()
simulation_name_by_session_id = dict()


# TODO Change with the real data
def send_simulations():
    emit(
        "simulations",
        [
            {"name": name, "status": "running", "completion": 0, "data": "none"}
            for name in simulation_process_by_name.keys()
        ],
        to=CLIENT_ROOM,
    )


def getSessionId():
    return request.sid


def log(message, auth_type, level=logging.INFO):
    if auth_type == "server":
        logging.log(level, f"[{auth_type}] {message}")
    else:
        logging.log(level, f"[{auth_type}] {getSessionId()} {message}")
        emit("log", f"{level} [{auth_type}] {getSessionId()} {message}", to=CLIENT_ROOM)


# MARK: Main events
@socketio.on("connect")
def on_connect(auth):
    auth_type = auth["type"]
    log("connected", auth_type)
    sockets_types_by_session_id[getSessionId()] = auth_type
    join_room(auth_type)


@socketio.on("disconnect")
def on_disconnect(reason):
    auth_type = sockets_types_by_session_id.pop(getSessionId())
    log(f"disconnected: {reason}", auth_type)
    leave_room(auth_type)

    # When a simulation client disconnects, we need to clean up the server
    if auth_type == "simulation":
        if not getSessionId() in simulation_name_by_session_id:
            return
        name = simulation_name_by_session_id.pop(getSessionId())
        simulation_session_id_by_name.pop(name)
        process = simulation_process_by_name.pop(name)
        process.terminate()
        process.join()
        emit("simulationEnded", name, to=CLIENT_ROOM)
        send_simulations()


# MARK: Client events
@socketio.on("startSimulation")
def on_client_start_simulation(name):
    # Check if a simulation with this name is already running
    if name in simulation_process_by_name:
        log(f"simulation {name} already running", "client")
        emit("simulationAlreadyRunning", to=CLIENT_ROOM)
        return

    log(f"starting simulation {name}", "client")
    simulation_process = multiprocessing.Process(target=run_simulation, args=(name,))
    simulation_process.start()
    simulation_process_by_name[name] = simulation_process


@socketio.on("stopSimulation")
def on_client_stop_simulation(name):
    # Check if a simulation with this name is running
    if name not in simulation_process_by_name:
        log(f"simulation {name} not running", "client")
        emit("simulationNotRunning", name, to=CLIENT_ROOM)
        return

    log(f"stopping simulation {name}", "client")
    simulation_session_id = simulation_session_id_by_name[name]
    emit("stopSimulation", to=simulation_session_id)


@socketio.on("pauseSimulation")
def on_client_pause_simulation(name):
    if name not in simulation_process_by_name:
        log(f"simulation {name} not running", "client")
        emit("simulationNotRunning", name, to=CLIENT_ROOM)
        return
    # Le log de la simulation dit deja que c'est en pause
    log(f"pausing simulation {name}", "client")
    simulation_session_id = simulation_session_id_by_name[name]
    emit("pauseSimulation", to=simulation_session_id)


@socketio.on("resumeSimulation")
def on_client_resume_simulation(name):
    if name not in simulation_process_by_name:
        log(f"simulation {name} not running", "client")
        emit("simulationNotRunning", name, to=CLIENT_ROOM)
        return

    # Le log de la simulation dit deja que c'est resumed
    log(f"resuming simulation {name}", "client")
    simulation_session_id = simulation_session_id_by_name[name]
    emit("resumeSimulation", to=simulation_session_id)


@socketio.on("getSimulations")
def on_client_get_simulations():
    log("getting simulations", "client")
    send_simulations()


@socketio.on("getAvailableData")
def on_client_get_data():
    log("getting available data", "client")
    current_dir = os.path.dirname(os.path.realpath(__file__))
    data_dir = os.path.join(current_dir, "..", "data")
    emit("availableData", os.listdir(data_dir), to=CLIENT_ROOM)


# MARK: Script events
@socketio.on("terminate")
def on_script_terminate():
    log("terminating server", "script")

    # TODO Maybe not
    # Terminate all running simulations
    for name, process in simulation_process_by_name.items():
        process.terminate()
        process.join()

    time.sleep(1)

    socketio.stop()


# MARK: Simulation events
@socketio.on("simulationStart")
def on_simulation_start(name):
    log(f"simulation {name} started", "simulation")
    emit("simulationStart", name, to=CLIENT_ROOM)
    simulation_name_by_session_id[getSessionId()] = name
    simulation_session_id_by_name[name] = getSessionId()
    send_simulations()


@socketio.on("simulationEnd")
def on_simulation_end(name):
    log(f"simulation {name} ended", "simulation")
    emit("simulationEnd", name, to=CLIENT_ROOM)

    simulation_session_id = simulation_name_by_session_id.pop(name)
    simulation_name_by_session_id.pop(simulation_session_id)
    simulation_process_by_name.pop(name)

    send_simulations()


@socketio.on("simulationPause")
def on_simulation_pause(name):
    log(f"simulation {name} paused", "simulation")
    emit("simulationPause", name, to=CLIENT_ROOM)
    send_simulations()


@socketio.on("simulationResume")
def on_simulation_resume(name):
    log(f"simulation {name} resumed", "simulation")
    emit("simulationResume", name, to=CLIENT_ROOM)
    send_simulations()


@socketio.on("log")
def on_simulation_log_event(name, message):
    log(f"simulation  {name}: {message}", "simulation")


# MARK: Server
def run_server():
    logging.basicConfig(level=logging.INFO)

    log(f"Starting server at {HOST}:{PORT}", "server")

    socketio.run(app, host=HOST, port=PORT)


if __name__ == "__main__":
    run_server()
