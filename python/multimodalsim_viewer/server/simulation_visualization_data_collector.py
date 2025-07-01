import threading
from typing import Optional

from multimodalsim.observer.data_collector import DataCollector
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
from multimodalsim.simulator.simulation import Simulation
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
from multimodalsim.statistics.data_analyzer import DataAnalyzer
from socketio import Client

from multimodalsim_viewer.common.utils import (
    HOST,
    SERVER_PORT,
    STATE_SAVE_STEP,
    SimulationStatus,
    build_simulation_id,
)
from multimodalsim_viewer.server.log_manager import register_log
from multimodalsim_viewer.server.simulation_visualization_data_model import (
    PassengerLegsUpdate,
    PassengerStatusUpdate,
    SimulationInformation,
    SimulationVisualizationDataManager,
    StatisticUpdate,
    Update,
    UpdateType,
    VehicleStatusUpdate,
    VehicleStopsUpdate,
    VisualizedEnvironment,
    VisualizedPassenger,
    VisualizedStop,
    VisualizedVehicle,
)


# MARK: Data Collector
class SimulationVisualizationDataCollector(DataCollector):  # pylint: disable=too-many-instance-attributes
    simulation_id: str
    update_counter: int
    visualized_environment: VisualizedEnvironment
    simulation_information: SimulationInformation
    current_save_file_path: str

    max_duration: float | None
    """
    Maximum duration of the simulation in in-simulation time (seconds). 
    The simulation will stop if it exceeds this duration.
    """

    # Special events
    last_queued_event_time: float
    passenger_assignment_event_queue: list[PassengerAssignment]
    vehicle_notification_event_queue: list[VehicleNotification]

    # Statistics
    data_analyzer: DataAnalyzer
    statistics_delta_time: int
    last_statistics_update_time: int

    # Communication
    sio: Client | None = None
    stop_event: threading.Event | None = None
    connection_thread: threading.Thread | None = None
    _simulation: Simulation | None = None
    status: SimulationStatus | None = None

    # Polylines
    saved_polylines_coordinates_pairs: set[str] = set()

    # Estimated end time
    last_estimated_end_time: float | None = None

    def __init__(  # pylint: disable=too-many-arguments, too-many-positional-arguments
        self,
        data_analyzer: DataAnalyzer,
        statistics_delta_time: int = 10,
        name: str = "simulation",
        input_data_description: str = "unknown",
        simulation_id: str | None = None,
        max_duration: float | None = None,
        offline: bool = False,
        stop_event: threading.Event | None = None,
    ) -> None:
        super().__init__()

        if simulation_id is None:
            simulation_id, _ = build_simulation_id(name)

        self.simulation_id = simulation_id
        self.update_counter = 0
        self.visualized_environment = VisualizedEnvironment()

        self.simulation_information = SimulationInformation(
            simulation_id, input_data_description, None, None, None, None
        )

        self.current_save_file_path = None

        self.max_duration = max_duration

        self.passenger_assignment_event_queue = []
        self.vehicle_notification_event_queue = []
        self.last_queued_event_time = 0

        self.data_analyzer = data_analyzer
        self.statistics_delta_time = statistics_delta_time
        self.last_statistics_update_time = None

        self.stop_event = stop_event

        if not offline:
            self.initialize_communication()

    @property
    def is_connected(self) -> bool:
        return self.sio is not None and self.sio.connected

    # MARK: +- Communication
    def initialize_communication(self) -> None:
        sio = Client(reconnection_attempts=1)

        self.sio = sio
        self.status = SimulationStatus.RUNNING

        @sio.on("pause-simulation")
        def pause_simulator():
            if self._simulation is not None:
                self._simulation.pause()
                self.status = SimulationStatus.PAUSED
                if self.is_connected:
                    self.sio.emit("simulation-pause", self.simulation_id)

        @sio.on("resume-simulation")
        def resume_simulator():
            if self._simulation is not None:
                self._simulation.resume()
                self.status = SimulationStatus.RUNNING
                if self.is_connected:
                    self.sio.emit("simulation-resume", self.simulation_id)

        @sio.on("stop-simulation")
        def stop_simulator():
            if self._simulation is not None:
                self._simulation.stop()
                self.status = SimulationStatus.STOPPING

        @sio.on("connect")
        def on_connect():
            sio.emit(
                "simulation-identification",
                (
                    self.simulation_id,
                    self.simulation_information.data,
                    self.simulation_information.simulation_start_time,
                    self.visualized_environment.timestamp,
                    self.visualized_environment.estimated_end_time,
                    self.max_duration,
                    self.status.value,
                ),
            )

        @sio.on("edit-simulation-configuration")
        def on_edit_simulation_configuration(max_duration: float | None):
            self.max_duration = max_duration

            if self.last_estimated_end_time is None:
                return

            # Notify the server if the estimated end time has changed
            new_estimated_end_time = min(
                self.last_estimated_end_time,
                (
                    self.simulation_information.simulation_start_time + self.max_duration
                    if self.max_duration is not None
                    else self.last_estimated_end_time
                ),
            )

            if new_estimated_end_time != self.visualized_environment.estimated_end_time:
                self.sio.emit(
                    "simulation-update-estimated-end-time",
                    (self.simulation_id, new_estimated_end_time),
                )
                self.visualized_environment.estimated_end_time = new_estimated_end_time

        if self.stop_event is None:
            self.stop_event = threading.Event()

        self.connection_thread = threading.Thread(target=self.handle_connection)
        self.connection_thread.start()

    def handle_connection(self) -> None:
        while not self.stop_event.is_set():

            if not self.sio.connected:
                try:
                    print("Trying to reconnect")
                    self.sio.connect(f"http://{HOST}:{SERVER_PORT}", auth={"type": "simulation"})
                    print("Connected")
                except Exception as e:  # pylint: disable=broad-exception-caught
                    print(f"Failed to connect to server: {e}")
                    print("Continuing in offline mode")

            self.sio.sleep(5)  # Check every 5 seconds

        self.sio.disconnect()
        self.sio.wait()

    # MARK: +- Collect
    def collect(
        self,
        env: Environment,
        current_event: Optional[Event] = None,
        event_index: Optional[int] = None,
        event_priority: Optional[int] = None,
    ) -> None:
        env.simulation_config.max_time = (
            (
                (
                    self.simulation_information.simulation_start_time
                    if self.simulation_information.simulation_start_time is not None
                    else env.current_time
                )
                + self.max_duration
            )
            if self.max_duration is not None
            else env.simulation_config.max_time
        )

        if current_event is None:
            return

        message = self.process_event(current_event, env)
        register_log(self.simulation_id, message)

        if self.is_connected:
            self.sio.emit("log", (self.simulation_id, message))

        if (
            self.last_statistics_update_time is None
            or current_event.time >= self.last_statistics_update_time + self.statistics_delta_time
        ):
            self.last_statistics_update_time = current_event.time
            self.add_update(
                Update(
                    UpdateType.UPDATE_STATISTIC,
                    StatisticUpdate(self.data_analyzer.get_statistics()),
                    current_event.time,
                ),
                env,
            )

    # MARK: +- Add Update
    def add_update(  # pylint: disable=too-many-branches, too-many-statements
        self, update: Update, environment: Environment
    ) -> None:
        update.order = self.update_counter
        self.visualized_environment.order = self.update_counter

        if self.update_counter == 0:
            # Add the simulation start time to the simulation information
            self.simulation_information.simulation_start_time = update.timestamp

            # Save the simulation information
            SimulationVisualizationDataManager.set_simulation_information(
                self.simulation_id, self.simulation_information
            )

            # Notify the server that the simulation has started and send the simulation start time
            if self.is_connected:
                self.sio.emit("simulation-start", (self.simulation_id, update.timestamp))

        if self.visualized_environment.timestamp != update.timestamp:
            # Notify the server that the simulation time has been updated
            if self.is_connected:
                self.sio.emit(
                    "simulation-update-time",
                    (
                        self.simulation_id,
                        update.timestamp,
                    ),
                )
            self.visualized_environment.timestamp = update.timestamp

        # Remember the last estimated end time in case of max_duration updates
        self.last_estimated_end_time = environment.estimated_end_time
        estimated_end_time = min(
            environment.estimated_end_time,
            (
                self.simulation_information.simulation_start_time + self.max_duration
                if self.max_duration is not None
                else environment.estimated_end_time
            ),
        )
        if estimated_end_time != self.visualized_environment.estimated_end_time:
            # Notify the server that the simulation estimated end time has been updated
            if self.is_connected:
                self.sio.emit(
                    "simulation-update-estimated-end-time",
                    (self.simulation_id, estimated_end_time),
                )
            self.visualized_environment.estimated_end_time = estimated_end_time

        # Save the state of the simulation every SAVE_STATE_STEP events before applying the update
        if self.update_counter % STATE_SAVE_STEP == 0:
            self.current_save_file_path = SimulationVisualizationDataManager.save_state(
                self.simulation_id, self.visualized_environment
            )

        if update.update_type == UpdateType.CREATE_PASSENGER:
            self.visualized_environment.add_passenger(update.data)
        elif update.update_type == UpdateType.CREATE_VEHICLE:
            self.visualized_environment.add_vehicle(update.data)
            data: VisualizedVehicle = update.data
            if data.polylines is not None:
                self.update_polylines_if_needed(data)
        elif update.update_type == UpdateType.UPDATE_PASSENGER_STATUS:
            passenger = self.visualized_environment.get_passenger(update.data.passenger_id)
            passenger.status = update.data.status
        elif update.update_type == UpdateType.UPDATE_PASSENGER_LEGS:
            passenger = self.visualized_environment.get_passenger(update.data.passenger_id)
            legs_update: PassengerLegsUpdate = update.data
            passenger.previous_legs = legs_update.previous_legs
            passenger.next_legs = legs_update.next_legs
            passenger.current_leg = legs_update.current_leg
        elif update.update_type == UpdateType.UPDATE_VEHICLE_STATUS:
            vehicle = self.visualized_environment.get_vehicle(update.data.vehicle_id)
            vehicle.status = update.data.status
        elif update.update_type == UpdateType.UPDATE_VEHICLE_STOPS:
            vehicle = self.visualized_environment.get_vehicle(update.data.vehicle_id)
            stops_update: VehicleStopsUpdate = update.data
            vehicle.previous_stops = stops_update.previous_stops
            vehicle.next_stops = stops_update.next_stops
            vehicle.current_stop = stops_update.current_stop
            if vehicle.polylines is not None:
                self.update_polylines_if_needed(vehicle)
        elif update.update_type == UpdateType.UPDATE_STATISTIC:
            statistic_update: StatisticUpdate = update.data
            self.visualized_environment.statistic = statistic_update.statistic

        SimulationVisualizationDataManager.save_update(self.current_save_file_path, update)

        self.update_counter += 1

    # MARK: +- Polylines
    def update_polylines_if_needed(self, vehicle: VisualizedVehicle) -> None:
        polylines = vehicle.polylines
        stops = vehicle.all_stops

        # A polyline needs to have at least 2 points
        if len(stops) < 2:
            return

        # Notify if their are not enough polylines
        if len(polylines) < len(stops) - 1:
            raise ValueError(f"Vehicle {vehicle.vehicle_id} has not enough polylines for its stops")

        stops_pairs: list[tuple[tuple[VisualizedStop, VisualizedStop], tuple[str, list[float]]]] = zip(
            [(stops[i], stops[i + 1]) for i in range(len(stops) - 1)],
            polylines.values(),
            strict=False,  # There may be more polylines than stops
        )

        polylines_to_save: dict[str, tuple[str, list[float]]] = {}

        for stop_pair, polyline in stops_pairs:
            first_stop, second_stop = stop_pair

            if (
                first_stop.latitude is None
                or first_stop.longitude is None
                or second_stop.latitude is None
                or second_stop.longitude is None
            ):
                raise ValueError(f"Vehicle {vehicle.vehicle_id} has stops without coordinates")

            coordinates_pair = (
                f"{first_stop.latitude},{first_stop.longitude},{second_stop.latitude},{second_stop.longitude}"
            )

            if coordinates_pair not in self.saved_polylines_coordinates_pairs:
                polylines_to_save[coordinates_pair] = polyline
                self.saved_polylines_coordinates_pairs.add(coordinates_pair)

        if len(polylines_to_save) > 0:
            SimulationVisualizationDataManager.set_polylines(self.simulation_id, polylines_to_save)

        if self.is_connected:
            self.sio.emit(
                "simulation-update-polylines-version",
                self.simulation_id,
            )

    # MARK: +- Flush
    def flush(self, environment) -> None:
        for event in self.passenger_assignment_event_queue:
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
            previous_passenger = self.visualized_environment.get_passenger(event.state_machine.owner.id)
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_LEGS,
                    PassengerLegsUpdate.from_trip_environment_and_previous_passenger(
                        event.state_machine.owner, environment, previous_passenger
                    ),
                    event.time,
                ),
                environment,
            )

        for event in self.vehicle_notification_event_queue:
            vehicle = event._VehicleNotification__vehicle  # pylint: disable=protected-access
            route = event._VehicleNotification__route  # pylint: disable=protected-access
            existing_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            if vehicle.polylines != existing_vehicle.polylines:
                existing_vehicle.polylines = vehicle.polylines

            self.add_update(
                Update(
                    UpdateType.UPDATE_VEHICLE_STOPS,
                    VehicleStopsUpdate.from_vehicle_and_route(vehicle, route),
                    event.time,
                ),
                environment,
            )

        self.passenger_assignment_event_queue = []
        self.vehicle_notification_event_queue = []

    @property
    def has_to_flush(self) -> bool:
        return len(self.passenger_assignment_event_queue) > 0 or len(self.vehicle_notification_event_queue) > 0

    # MARK: +- Process Event
    def process_event(  # pylint: disable=too-many-branches, too-many-statements, too-many-return-statements
        self, event: Event, environment: Environment
    ) -> str:
        # In case that a queued event is not linked to EnvironmentIdle
        if self.has_to_flush and event.time > self.last_queued_event_time:
            self.flush(environment)

        # Optimize
        if isinstance(event, Optimize):
            # Do nothing ?
            return f"{event.time} TODO Optimize"

        # EnvironmentUpdate
        if isinstance(event, EnvironmentUpdate):
            # Do nothing ?
            return f"{event.time} TODO EnvironmentUpdate"

        # EnvironmentIdle
        if isinstance(event, EnvironmentIdle):
            self.flush(environment)
            return f"{event.time} TODO EnvironmentIdle"

        # PassengerRelease
        if isinstance(event, PassengerRelease):
            passenger = VisualizedPassenger.from_trip_and_environment(event.trip, environment)
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
        if isinstance(event, PassengerAssignment):
            self.passenger_assignment_event_queue.append(event)
            self.last_queued_event_time = event.time
            return f"{event.time} TODO PassengerAssignment"

        # PassengerReady
        if isinstance(event, PassengerReady):
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
        if isinstance(event, PassengerToBoard):
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
            previous_passenger = self.visualized_environment.get_passenger(event.state_machine.owner.id)
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_LEGS,
                    PassengerLegsUpdate.from_trip_environment_and_previous_passenger(
                        event.state_machine.owner, environment, previous_passenger
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO PassengerToBoard"

        # PassengerAlighting
        if isinstance(event, PassengerAlighting):
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
            previous_passenger = self.visualized_environment.get_passenger(event.state_machine.owner.id)
            self.add_update(
                Update(
                    UpdateType.UPDATE_PASSENGER_LEGS,
                    PassengerLegsUpdate.from_trip_environment_and_previous_passenger(
                        event.state_machine.owner, environment, previous_passenger
                    ),
                    event.time,
                ),
                environment,
            )
            return f"{event.time} TODO PassengerAlighting"

        # VehicleWaiting
        if isinstance(event, VehicleWaiting):
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
        if isinstance(event, VehicleBoarding):
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
        if isinstance(event, VehicleDeparture):
            route = event._VehicleDeparture__route  # pylint: disable=protected-access
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
        if isinstance(event, VehicleArrival):
            route = event._VehicleArrival__route  # pylint: disable=protected-access
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
        if isinstance(event, VehicleComplete):
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
        if isinstance(event, VehicleReady):
            vehicle = VisualizedVehicle.from_vehicle_and_route(
                event.vehicle, event._VehicleReady__route  # pylint: disable=protected-access
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
        if isinstance(event, VehicleNotification):
            self.vehicle_notification_event_queue.append(event)
            self.last_queued_event_time = event.time
            return f"{event.time} TODO VehicleNotification"

        # VehicleBoarded
        if isinstance(event, VehicleBoarded):
            return f"{event.time} TODO VehicleBoarded"

        # VehicleAlighted
        if isinstance(event, VehicleAlighted):
            return f"{event.time} TODO VehicleAlighted"

        # VehicleUpdatePositionEvent
        if isinstance(event, VehicleUpdatePositionEvent):
            # Do nothing ?
            return f"{event.time} TODO VehicleUpdatePositionEvent"

        # RecurrentTimeSyncEvent
        if isinstance(event, RecurrentTimeSyncEvent):
            # Do nothing ?
            return f"{event.time} TODO RecurrentTimeSyncEvent"

        # Hold
        if isinstance(event, Hold):
            # Do nothing ?
            return f"{event.time} TODO Hold"

        raise NotImplementedError(f"Event {event} not implemented")

    # MARK: +- Clean Up
    def clean_up(self, env):
        self.simulation_information.simulation_end_time = self.visualized_environment.timestamp
        self.simulation_information.last_update_order = self.visualized_environment.order

        SimulationVisualizationDataManager.set_simulation_information(self.simulation_id, self.simulation_information)

        if self.stop_event is not None:
            self.stop_event.set()

        if self.connection_thread is not None:
            self.connection_thread.join()

        if self.is_connected:
            self.sio.disconnect()

        if self.sio is not None:
            self.sio.wait()
