import logging
import os
import time
import shutil
import base64


from flask import Flask
from flask_socketio import SocketIO, emit, join_room, leave_room
from server_utils import CLIENT_ROOM, HOST, PORT, getSessionId, log
from simulation_manager import SimulationManager


def run_server():
    app = Flask(__name__)

    socketio = SocketIO(app, cors_allowed_origins="*")

    # key = session id, value = auth type
    sockets_types_by_session_id = dict()

    simulation_manager = SimulationManager()

    # Define the data directory
    current_dir = os.path.dirname(os.path.realpath(__file__))
    data_dir = os.path.join(current_dir, "..", "data")

    # Ensure the data directory exists
    os.makedirs(data_dir, exist_ok=True)

    # MARK: Main events
    @socketio.on("connect")
    def on_connect(auth):
        auth_type = auth["type"]
        log("connected", auth_type)
        sockets_types_by_session_id[getSessionId()] = auth_type
        join_room(auth_type)

    @socketio.on("disconnect")
    def on_disconnect(reason):
        session_id = getSessionId()
        auth_type = sockets_types_by_session_id.pop(session_id)
        log(f"disconnected: {reason}", auth_type)
        leave_room(auth_type)

        if auth_type == "simulation":
            simulation_manager.on_simulation_disconnect(session_id)

    # MARK: Client events
    @socketio.on("startSimulation")
    def on_client_start_simulation(name, data, response_event):
        log(
            f"starting simulation {name} with data {data} and response event {response_event}",
            "client",
        )
        simulation_manager.start_simulation(name, data, response_event)

    @socketio.on("stopSimulation")
    def on_client_stop_simulation(simulation_id):
        log(f"stopping simulation {simulation_id}", "client")
        simulation_manager.stop_simulation(simulation_id)

    @socketio.on("pauseSimulation")
    def on_client_pause_simulation(simulation_id):
        log(f"pausing simulation {simulation_id}", "client")
        simulation_manager.pause_simulation(simulation_id)

    @socketio.on("resumeSimulation")
    def on_client_resume_simulation(simulation_id):
        log(f"resuming simulation {simulation_id}", "client")
        simulation_manager.resume_simulation(simulation_id)

    @socketio.on("getSimulations")
    def on_client_get_simulations():
        log("getting simulations", "client")
        simulation_manager.emit_simulations()

    @socketio.on("getAvailableData")
    def on_client_get_data():
        log("getting available data", "client")
        current_dir = os.path.dirname(os.path.realpath(__file__))
        data_dir = os.path.join(current_dir, "..", "data")
        emit("availableData", os.listdir(data_dir), to=CLIENT_ROOM)

    @socketio.on("importFolder")
    def on_import_folder(data):
        log("importing folder", folder_name)
        folder_name = data.get("folderName")
        files = data.get("files", [])

        if not folder_name or not files:
            return
        # Define the destination folder
        current_dir = os.path.dirname(os.path.realpath(__file__))
        target_dir = os.path.join(current_dir, "..", "data", folder_name)

        os.makedirs(target_dir, exist_ok=True)

        for file in files:
            file_path = os.path.join(target_dir, file["name"])
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(file["content"])
        

    # MARK: Script events
    @socketio.on("terminate")
    def on_script_terminate():
        log("terminating server", "script")

        for simulation_id, simulation_handler in simulation_manager.simulations.items():
            if simulation_handler.process is not None:
                simulation_handler.process.terminate()
                simulation_handler.process.join()

        time.sleep(1)

        socketio.stop()

    # MARK: Simulation events
    @socketio.on("simulationStart")
    def on_simulation_start(simulation_id):
        log(f"simulation {simulation_id} started", "simulation")
        simulation_manager.on_simulation_start(simulation_id, getSessionId())

    @socketio.on("simulationEnd")
    def on_simulation_end(simulation_id):
        log(f"simulation {simulation_id} ended", "simulation")
        simulation_manager.on_simulation_end(simulation_id)

    @socketio.on("simulationPause")
    def on_simulation_pause(simulation_id):
        log(f"simulation {simulation_id} paused", "simulation")
        simulation_manager.on_simulation_pause(simulation_id)

    @socketio.on("simulationResume")
    def on_simulation_resume(simulation_id):
        log(f"simulation {simulation_id} resumed", "simulation")
        simulation_manager.on_simulation_resume(simulation_id)

    @socketio.on("log")
    def on_simulation_log_event(simulation_id, message):
        log(f"simulation  {simulation_id}: {message}", "simulation")
        logging.basicConfig(level=logging.INFO)

        log(f"Starting server at {HOST}:{PORT}", "server")

    # MARK: Run server
    socketio.run(app, host=HOST, port=PORT)


if __name__ == "__main__":
    run_server()
