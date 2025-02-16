import os
from typing import Optional

from log_manager import register_log
from multimodalsim.observer.data_collector import DataCollector
from multimodalsim.observer.environment_observer import EnvironmentObserver
from multimodalsim.observer.visualizer import Visualizer
from multimodalsim.simulator.environment import Environment
from multimodalsim.simulator.event import Event, RecurrentTimeSyncEvent
from multimodalsim.simulator.optimization_event import (
    EnvironmentIdle,
    EnvironmentUpdate,
    Hold,
    Optimize,
)
from multimodalsim.simulator.passenger_event import (
    PassengerAlighting,
    PassengerAssignment,
    PassengerReady,
    PassengerRelease,
    PassengerToBoard,
)
from multimodalsim.simulator.vehicle_event import (
    VehicleAlighted,
    VehicleArrival,
    VehicleBoarded,
    VehicleBoarding,
    VehicleComplete,
    VehicleDeparture,
    VehicleNotification,
    VehicleReady,
    VehicleUpdatePositionEvent,
    VehicleWaiting,
)
from server_utils import STATE_SAVE_STEP
from simulation_visualization_data_model import (
    PassengerStatusUpdate,
    SimulationInformation,
    Update,
    UpdateType,
    VehiclePositionUpdate,
    VehicleStatusUpdate,
    VisualizedEnvironment,
    VisualizedPassenger,
    VisualizedVehicle,
    get_simulation_save_file_path,
)
from socketio import Client


# MARK: Data Collector
class SimulationVisualizationDataCollector(DataCollector):
    simulation_id: str
    update_counter: int
    visualized_environment: VisualizedEnvironment
    sio: Client
    simulation_information: SimulationInformation

    def __init__(self, simulation_id: str, data: str, sio: Client) -> None:
        self.simulation_id = simulation_id
        self.update_counter = 0
        self.visualized_environment = VisualizedEnvironment()
        self.sio = sio

        self.simulation_information = SimulationInformation(
            simulation_id, data, None, None
        )

    # MARK: +- Collect
    def collect(
        self,
        env: Environment,
        current_event: Optional[Event] = None,
        event_index: Optional[int] = None,
        event_priority: Optional[int] = None,
    ) -> None:
        if current_event is None:
            return

        message = self.process_event(current_event, env)
        register_log(self.simulation_id, message)

        if self.sio.connected:
            self.sio.emit("log", (self.simulation_id, message))

    # MARK: +- Add First Line
    def add_first_line(self) -> None:
        file_path = get_simulation_save_file_path(self.simulation_id)

        with open(file_path, "r") as file:
            lines = file.readlines()

        first_line = str(self.simulation_information.serialize()) + "\n"
        if len(lines) > 0:
            lines[0] = first_line
        else:
            lines.append(first_line)

        with open(file_path, "w") as file:
            file.writelines(lines)

    # MARK: +- Add Line To File
    def add_line_to_file(self, line: str | dict) -> None:
        file_path = get_simulation_save_file_path(self.simulation_id)

        with open(file_path, "a") as file:
            file.write(line + "\n")

    # MARK: +- Add Update
    def add_update(self, update: Update, environment: Environment) -> None:
        update.order = self.update_counter
        self.visualized_environment.order = self.update_counter
        self.update_counter += 1

        if update.type == UpdateType.CREATE_PASSENGER:
            self.visualized_environment.add_passenger(update.data)
        elif update.type == UpdateType.CREATE_VEHICLE:
            self.visualized_environment.add_vehicle(update.data)
        elif update.type == UpdateType.UPDATE_PASSENGER_STATUS:
            passenger = self.visualized_environment.get_passenger(
                update.data.passenger_id
            )
            passenger.status = update.data.status
        elif update.type == UpdateType.UPDATE_VEHICLE_STATUS:
            vehicle = self.visualized_environment.get_vehicle(update.data.vehicle_id)
            vehicle.status = update.data.status
        elif update.type == UpdateType.UPDATE_VEHICLE_POSITION:
            vehicle = self.visualized_environment.get_vehicle(update.data.vehicle_id)
            vehicle.latitude = update.data.latitude
            vehicle.longitude = update.data.longitude

        if self.update_counter == 1:
            # Add the simulation start time to the simulation information
            self.simulation_information.simulation_start_time = update.timestamp
            self.add_first_line()

            # Notify the server that the simulation has started and send the simulation start time
            if self.sio.connected:
                self.sio.emit(
                    "simulation-start", (self.simulation_id, update.timestamp)
                )

        if self.sio.connected:
            if self.visualized_environment.timestamp != update.timestamp:
                self.sio.emit(
                    "simulation-update-time",
                    (
                        self.simulation_id,
                        update.timestamp,
                    ),
                )
                self.visualized_environment.timestamp = update.timestamp

            if (
                environment.estimated_end_time
                != self.visualized_environment.estimated_end_time
            ):
                self.sio.emit(
                    "simulation-update-estimated-end-time",
                    (
                        self.simulation_id,
                        environment.estimated_end_time,
                    ),
                )
                self.visualized_environment.estimated_end_time = (
                    environment.estimated_end_time
                )

        self.add_line_to_file(str(update.serialize()))

        # Save the state of the simulation every SAVE_STATE_STEP events
        if self.update_counter % STATE_SAVE_STEP == 0:
            self.add_line_to_file(str(self.visualized_environment.serialize()))

    # MARK: +- Process Event
    def process_event(self, event: Event, environment: Environment) -> str:
        # Optimize
        if isinstance(event, Optimize):
            # Do nothing ?
            return f"{event.time} TODO Optimize"

        # EnvironmentUpdate
        elif isinstance(event, EnvironmentUpdate):
            # Do nothing ?
            return f"{event.time} TODO EnvironmentUpdate"

        # EnvironmentIdle
        elif isinstance(event, EnvironmentIdle):
            # Do nothing ?
            return f"{event.time} TODO EnvironmentIdle"

        # PassengerRelease
        elif isinstance(event, PassengerRelease):
            passenger = VisualizedPassenger.from_trip(event.trip)
            self.add_update(
                Update(
                    UpdateType.CREATE_PASSENGER,
                    passenger,
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO PassengerRelease"

        # PassengerAssignment
        elif isinstance(event, PassengerAssignment):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate.from_trip(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO PassengerAssignment"

        # PassengerReady
        elif isinstance(event, PassengerReady):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate.from_trip(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO PassengerReady"

        # PassengerToBoard
        elif isinstance(event, PassengerToBoard):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate.from_trip(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO PassengerToBoard"

        # PassengerAlighting
        elif isinstance(event, PassengerAlighting):
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_STATUS,
                    PassengerStatusUpdate.from_trip(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO PassengerAlighting"

        # VehicleWaiting
        elif isinstance(event, VehicleWaiting):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate.from_vehicle(event.state_machine.owner),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleWaiting"

        # VehicleBoarding
        elif isinstance(event, VehicleBoarding):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate.from_vehicle(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleBoarding"

        elif isinstance(event, VehicleDeparture):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate.from_vehicle(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleDeparture"

        # VehicleArrival
        elif isinstance(event, VehicleArrival):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate.from_vehicle(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleArrival"

        # VehicleComplete
        elif isinstance(event, VehicleComplete):
            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STATUS,
                    VehicleStatusUpdate.from_vehicle(
                        event.state_machine.owner,
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleComplete"

        # VehicleReady
        elif isinstance(event, VehicleReady):
            vehicle = VisualizedVehicle.from_vehicle(event.vehicle)
            self.add_update(
                Update(
                    UpdateType.CREATE_VEHICLE,
                    vehicle,
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleReady"

        # VehicleNotification
        elif isinstance(event, VehicleNotification):
            return f"{event.time} TODO VehicleNotification"

        # VehicleBoarded
        elif isinstance(event, VehicleBoarded):
            return f"{event.time} TODO VehicleBoarded"

        # VehicleAlighted
        elif isinstance(event, VehicleAlighted):
            return f"{event.time} TODO VehicleAlighted"

        # VehicleUpdatePositionEvent
        elif isinstance(event, VehicleUpdatePositionEvent):
            updated_vehicle = event.vehicle
            current_visualized_vehicle = self.visualized_environment.get_vehicle(
                updated_vehicle.id
            )
            if event.vehicle.position is not None and (
                current_visualized_vehicle.latitude != event.vehicle.position.lat
                or current_visualized_vehicle.longitude != event.vehicle.position.lon
            ):
                self.add_update(
                    Update(
                        UpdateType.UPDATE_VEHICLE_POSITION,
                        VehiclePositionUpdate(
                            event.vehicle,
                        ),
                        event.time,
                    ),
                    environment,
                )
            return f"{event.time} TODO VehicleUpdatePositionEvent"

        # RecurrentTimeSyncEvent
        elif isinstance(event, RecurrentTimeSyncEvent):
            # Do nothing ?
            return f"{event.time} TODO RecurrentTimeSyncEvent"

        # Hold
        elif isinstance(event, Hold):
            # Do nothing ?
            return f"{event.time} TODO Hold"

        else:
            raise NotImplementedError(f"Event {event} not implemented")


# MARK: Visualizer
class SimulationVisualizationVisualizer(Visualizer):
    def __init__(
        self,
        simulation_id: str,
        data_collector: SimulationVisualizationDataCollector,
        sio: Client,
    ) -> None:
        super().__init__()
        self.simulation_id = simulation_id
        self.data_collector = data_collector
        self.sio = sio

    def visualize_environment(
        self,
        env: Environment,
        current_event: Optional[Event] = None,
        event_index: Optional[int] = None,
        event_priority: Optional[int] = None,
    ) -> None:
        if current_event is None:
            # Notify the server that the simulation has ended
            if self.sio.connected:
                self.sio.emit(
                    "simulation-end",
                    (
                        self.simulation_id,
                        self.data_collector.visualized_environment.timestamp,
                    ),
                )


# MARK: Environment Observer
class SimulationVisualizationEnvironmentObserver(EnvironmentObserver):

    def __init__(self, simulation_id: str, data: str, sio: Client) -> None:
        data_collector = SimulationVisualizationDataCollector(simulation_id, data, sio)
        super().__init__(
            visualizers=SimulationVisualizationVisualizer(
                simulation_id, data_collector, sio
            ),
            data_collectors=data_collector,
        )
