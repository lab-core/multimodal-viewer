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
from multimodalsim.simulator.vehicle import Vehicle
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
    SimulationVisualizationDataManager,
    Update,
    UpdateType,
    VehicleStatusUpdate,
    VehicleStopsUpdate,
    VisualizedEnvironment,
    VisualizedPassenger,
    VisualizedStop,
    VisualizedVehicle,
)
from socketio import Client


# MARK: Data Collector
class SimulationVisualizationDataCollector(DataCollector):
    simulation_id: str
    update_counter: int
    visualized_environment: VisualizedEnvironment
    sio: Client
    simulation_information: SimulationInformation
    current_save_file_path: str
    max_time: float | None

    def __init__(
        self, simulation_id: str, data: str, sio: Client, max_time: float | None
    ) -> None:
        self.simulation_id = simulation_id
        self.update_counter = 0
        self.visualized_environment = VisualizedEnvironment()
        self.sio = sio

        self.simulation_information = SimulationInformation(
            simulation_id, data, None, None, None, None
        )

        self.current_save_file_path = None

        self.max_time = max_time

    # MARK: +- Collect
    def collect(
        self,
        env: Environment,
        current_event: Optional[Event] = None,
        event_index: Optional[int] = None,
        event_priority: Optional[int] = None,
    ) -> None:
        env.simulation_config.max_time = self.max_time

        if current_event is None:
            return

        message = self.process_event(current_event, env)
        register_log(self.simulation_id, message)

        if self.sio.connected:
            self.sio.emit("log", (self.simulation_id, message))

    # MARK: +- Add Update
    def add_update(self, update: Update, environment: Environment) -> None:
        update.order = self.update_counter
        self.visualized_environment.order = self.update_counter

        # Save the state of the simulation every SAVE_STATE_STEP events before applying the update
        if self.update_counter % STATE_SAVE_STEP == 0:
            self.current_save_file_path = SimulationVisualizationDataManager.save_state(
                self.simulation_id, self.visualized_environment
            )

        if update.type == UpdateType.CREATE_PASSENGER:
            self.visualized_environment.add_passenger(update.data)
        elif update.type == UpdateType.CREATE_VEHICLE:
            self.visualized_environment.add_vehicle(update.data)
            data: VisualizedVehicle = update.data
            if data.polylines is not None:
                SimulationVisualizationDataManager.set_polylines(
                    self.simulation_id, data
                )
                if self.sio.connected:
                    self.sio.emit(
                        "simulation-update-polylines-version",
                        self.simulation_id,
                    )
        elif update.type == UpdateType.UPDATE_PASSENGER_STATUS:
            passenger = self.visualized_environment.get_passenger(
                update.data.passenger_id
            )
            passenger.status = update.data.status
        elif update.type == UpdateType.UPDATE_VEHICLE_STATUS:
            vehicle = self.visualized_environment.get_vehicle(update.data.vehicle_id)
            vehicle.status = update.data.status
        elif update.type == UpdateType.UPDATE_VEHICLE_STOPS:
            vehicle = self.visualized_environment.get_vehicle(update.data.vehicle_id)
            stops_update: VehicleStopsUpdate = update.data
            vehicle.previous_stops = stops_update.previous_stops
            vehicle.next_stops = stops_update.next_stops
            vehicle.current_stop = stops_update.current_stop

        if self.update_counter == 0:
            # Add the simulation start time to the simulation information
            self.simulation_information.simulation_start_time = update.timestamp

            #           # Save the simulation information
            SimulationVisualizationDataManager.set_simulation_information(
                self.simulation_id, self.simulation_information
            )

            # Notify the server that the simulation has started and send the simulation start time
            if self.sio.connected:
                self.sio.emit(
                    "simulation-start", (self.simulation_id, update.timestamp)
                )

        if self.visualized_environment.timestamp != update.timestamp:
            # Notify the server that the simulation time has been updated
            if self.sio.connected:
                self.sio.emit(
                    "simulation-update-time",
                    (
                        self.simulation_id,
                        update.timestamp,
                    ),
                )
            self.visualized_environment.timestamp = update.timestamp

        estimated_end_time = min(
            environment.estimated_end_time,
            (
                self.max_time
                if self.max_time is not None
                else environment.estimated_end_time
            ),
        )
        if estimated_end_time != self.visualized_environment.estimated_end_time:
            # Notify the server that the simulation estimated end time has been updated
            if self.sio.connected:
                self.sio.emit(
                    "simulation-update-estimated-end-time",
                    (self.simulation_id, estimated_end_time),
                )
            self.visualized_environment.estimated_end_time = estimated_end_time

        SimulationVisualizationDataManager.save_update(
            self.current_save_file_path, update
        )

        self.update_counter += 1

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

        # VehicleDeparture
        elif isinstance(event, VehicleDeparture):
            route = event._VehicleDeparture__route
            vehicle = event.state_machine.owner

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

            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STOPS,
                    VehicleStopsUpdate.from_vehicle_and_route(vehicle, route),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleDeparture"

        # VehicleArrival
        elif isinstance(event, VehicleArrival):
            route = event._VehicleArrival__route
            vehicle = event.state_machine.owner

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

            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STOPS,
                    VehicleStopsUpdate.from_vehicle_and_route(vehicle, route),
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
            vehicle = VisualizedVehicle.from_vehicle_and_route(
                event.vehicle, event._VehicleReady__route
            )
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
            vehicle = event._VehicleNotification__vehicle
            route = event._VehicleNotification__route
            existing_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            if vehicle.polylines != existing_vehicle.polylines:
                existing_vehicle.polylines = vehicle.polylines
                SimulationVisualizationDataManager.set_polylines(
                    self.simulation_id, existing_vehicle
                )
                if self.sio.connected:
                    self.sio.emit(
                        "simulation-update-polylines-version",
                        self.simulation_id,
                    )

            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STOPS,
                    VehicleStopsUpdate.from_vehicle_and_route(vehicle, route),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO VehicleNotification"

        # VehicleBoarded
        elif isinstance(event, VehicleBoarded):
            return f"{event.time} TODO VehicleBoarded"

        # VehicleAlighted
        elif isinstance(event, VehicleAlighted):
            return f"{event.time} TODO VehicleAlighted"

        # VehicleUpdatePositionEvent
        elif isinstance(event, VehicleUpdatePositionEvent):
            # Do nothing ?
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
            self.data_collector.simulation_information.simulation_end_time = (
                self.data_collector.visualized_environment.timestamp
            )
            self.data_collector.simulation_information.last_update_order = (
                self.data_collector.visualized_environment.order
            )

            SimulationVisualizationDataManager.set_simulation_information(
                self.simulation_id, self.data_collector.simulation_information
            )

            # Notify the server that the simulation has ended
            if self.sio.connected:
                self.sio.emit("simulation-end", self.simulation_id)


# MARK: Environment Observer
class SimulationVisualizationEnvironmentObserver(EnvironmentObserver):
    data_collector: SimulationVisualizationDataCollector

    def __init__(
        self, simulation_id: str, data: str, sio: Client, max_time: float | None
    ) -> None:
        self.data_collector = SimulationVisualizationDataCollector(
            simulation_id, data, sio, max_time
        )
        super().__init__(
            visualizers=SimulationVisualizationVisualizer(
                simulation_id, self.data_collector, sio
            ),
            data_collectors=self.data_collector,
        )

    @property
    def max_time(self) -> float | None:
        return self.data_collector.max_time

    @max_time.setter
    def max_time(self, max_time: float | None) -> None:
        self.data_collector.max_time = max_time
