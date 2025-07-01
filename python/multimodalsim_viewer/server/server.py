import logging
import time

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room

from multimodalsim_viewer.common.utils import (
    CLIENT_ROOM,
    get_available_data,
    get_session_id,
    log,
)
from multimodalsim_viewer.server.http_routes import http_routes
from multimodalsim_viewer.server.simulation_manager import SimulationManager


def configure_server() -> tuple[Flask, SocketIO]:  # pylint: disable=too-many-statements, too-many-locals
    app = Flask(__name__)

    # Register HTTP routes
    CORS(app)
    app.register_blueprint(http_routes)

    socketio = SocketIO(app, cors_allowed_origins="*")

    # key = session id, value = auth type
    sockets_types_by_session_id = {}

    simulation_manager = SimulationManager()

    # MARK: Main events
    @socketio.on("connect")
    def on_connect(auth):
        auth_type = auth["type"]
        log("connected", auth_type)
        sockets_types_by_session_id[get_session_id()] = auth_type
        join_room(auth_type)

    @socketio.on("disconnect")
    def on_disconnect(reason):
        session_id = get_session_id()
        auth_type = sockets_types_by_session_id.pop(session_id)
        log(f"disconnected: {reason}", auth_type)
        leave_room(auth_type)

        if auth_type == "simulation":
            simulation_manager.on_simulation_disconnect(session_id)

    # MARK: Client events
    @socketio.on("start-simulation")
    def on_client_start_simulation(name, data, response_event, max_duration):
        log(
            f"starting simulation {name} with data {data}, "
            f"response event {response_event} and max duration {max_duration}",
            "client",
        )
        simulation_manager.start_simulation(name, data, response_event, max_duration)

    @socketio.on("stop-simulation")
    def on_client_stop_simulation(simulation_id):
        log(f"stopping simulation {simulation_id}", "client")
        simulation_manager.stop_simulation(simulation_id)

    @socketio.on("pause-simulation")
    def on_client_pause_simulation(simulation_id):
        log(f"pausing simulation {simulation_id}", "client")
        simulation_manager.pause_simulation(simulation_id)

    @socketio.on("resume-simulation")
    def on_client_resume_simulation(simulation_id):
        log(f"resuming simulation {simulation_id}", "client")
        simulation_manager.resume_simulation(simulation_id)

    @socketio.on("get-simulations")
    def on_client_get_simulations():
        log("getting simulations", "client")
        simulation_manager.emit_simulations()

    @socketio.on("get-available-data")
    def on_client_get_data():
        log("getting available data", "client")
        emit("available-data", get_available_data(), to=CLIENT_ROOM)

    @socketio.on("get-missing-simulation-states")
    def on_client_get_missing_simulation_states(simulation_id, visualization_time, loaded_state_orders):
        log(
            f"getting missing simulation states for {simulation_id} "
            f"with visualization time {visualization_time} "
            f"and {len(loaded_state_orders)} loaded state orders",
            "client",
        )
        simulation_manager.emit_missing_simulation_states(simulation_id, visualization_time, loaded_state_orders)

    @socketio.on("get-polylines")
    def on_client_get_polylines(simulation_id):
        log(f"getting polylines for {simulation_id}", "client")
        simulation_manager.emit_simulation_polylines(simulation_id)

    @socketio.on("edit-simulation-configuration")
    def on_client_edit_simulation_configuration(simulation_id, max_duration):
        log(
            f"editing simulation {simulation_id} configuration with max duration {max_duration}",
            "client",
        )
        simulation_manager.edit_simulation_configuration(simulation_id, max_duration)

    # MARK: Script events
    @socketio.on("terminate")
    def on_script_terminate():
        log("terminating server", "script")

        for simulation_id, simulation_handler in simulation_manager.simulations.items():
            if simulation_handler.process is not None:
                simulation_manager.stop_simulation(simulation_id)
                simulation_handler.process.join()

        # Wait for all connections to close
        time.sleep(1)

        socketio.stop()

        print("Server terminated successfully.")

    # MARK: Simulation events
    @socketio.on("simulation-start")
    def on_simulation_start(simulation_id, simulation_start_time):
        log(f"simulation {simulation_id} started", "simulation")
        simulation_manager.on_simulation_start(simulation_id, get_session_id(), simulation_start_time)

    @socketio.on("simulation-pause")
    def on_simulation_pause(simulation_id):
        log(f"simulation {simulation_id} paused", "simulation")
        simulation_manager.on_simulation_pause(simulation_id)

    @socketio.on("simulation-resume")
    def on_simulation_resume(simulation_id):
        log(f"simulation {simulation_id} resumed", "simulation")
        simulation_manager.on_simulation_resume(simulation_id)

    @socketio.on("log")
    def on_simulation_log(simulation_id, message):
        log(f"simulation  {simulation_id}: {message}", "simulation", logging.DEBUG)

    @socketio.on("simulation-update-time")
    def on_simulation_update_time(simulation_id, timestamp):
        log(
            f"simulation  {simulation_id} time: {timestamp}",
            "simulation",
            logging.DEBUG,
        )
        simulation_manager.on_simulation_update_time(simulation_id, timestamp)

    @socketio.on("simulation-update-estimated-end-time")
    def on_simulation_update_estimated_end_time(simulation_id, estimated_end_time):
        log(
            f"simulation  {simulation_id} estimated end time: {estimated_end_time}",
            "simulation",
            logging.DEBUG,
        )
        simulation_manager.on_simulation_update_estimated_end_time(simulation_id, estimated_end_time)

    @socketio.on("simulation-update-polylines-version")
    def on_simulation_update_polylines_version(simulation_id):
        log(f"simulation  {simulation_id} polylines version updated", "simulation")

        simulation_manager.on_simulation_update_polylines_version(simulation_id)

    @socketio.on("simulation-identification")
    def on_simulation_identification(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        simulation_id,
        data,
        simulation_start_time,
        timestamp,
        estimated_end_time,
        max_duration,
        status,
    ):
        log(
            f"simulation  {simulation_id} identified with data {data}, "
            f"simulation start time {simulation_start_time}, timestamp {timestamp}, "
            f"estimated end time {estimated_end_time}, max duration {max_duration} and status {status}",
            "simulation",
        )
        simulation_manager.on_simulation_identification(
            simulation_id,
            data,
            simulation_start_time,
            timestamp,
            estimated_end_time,
            max_duration,
            status,
            get_session_id(),
        )

    return app, socketio
