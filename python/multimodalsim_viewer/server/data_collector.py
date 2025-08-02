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
    NUMBER_OF_UPDATES_BETWEEN_STATES,
    SERVER_PORT,
    SimulationStatus,
    build_simulation_id,
)
from multimodalsim_viewer.models.environment import VisualizedEnvironment
from multimodalsim_viewer.models.passenger import VisualizedPassenger
from multimodalsim_viewer.models.simulation_information import SimulationInformation
from multimodalsim_viewer.models.stop import VisualizedStop
from multimodalsim_viewer.models.update import (
    PassengerUpdate,
    StatisticsUpdate,
    Update,
    VehicleUpdate,
)
from multimodalsim_viewer.models.vehicle import VisualizedVehicle
from multimodalsim_viewer.server.data_manager import SimulationVisualizationDataManager


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

        self.process_event(current_event, env)

        if (
            self.last_statistics_update_time is None
            or current_event.time >= self.last_statistics_update_time + self.statistics_delta_time
        ):
            self.last_statistics_update_time = current_event.time
            self.add_update(
                StatisticsUpdate(
                    self.update_counter,
                    event_index if event_index is not None else -1,
                    current_event.name,
                    current_event.time,
                    self.data_analyzer.get_statistics(),
                ),
                env,
            )

    # MARK: +- Add Update
    def add_update(  # pylint: disable=too-many-branches, too-many-statements
        self, update: Update, environment: Environment
    ) -> None:
        update.update_index = self.update_counter
        self.visualized_environment.update_index = self.update_counter

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
        if self.update_counter % NUMBER_OF_UPDATES_BETWEEN_STATES == 0:
            self.current_save_file_path = SimulationVisualizationDataManager.save_state(
                self.simulation_id, self.visualized_environment
            )

        update.apply(self.visualized_environment)

        if isinstance(update, VehicleUpdate):
            vehicle = self.visualized_environment.get_vehicle(update.vehicle_id)
            if vehicle is not None:
                self.update_polylines_if_needed(vehicle)

        SimulationVisualizationDataManager.save_update(self.current_save_file_path, update)

        self.update_counter += 1

    # MARK: +- Polylines
    def update_polylines_if_needed(self, vehicle: VisualizedVehicle) -> None:
        polylines = vehicle.polylines
        stops = vehicle.all_stops

        if polylines is None:
            # No polylines to update
            return

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
            old_passenger = self.visualized_environment.get_passenger(event.state_machine.owner.id)
            new_passenger = VisualizedPassenger.from_trip_and_environment(event.state_machine.owner, environment)

            self.add_update(
                PassengerUpdate(self.update_counter, event.index, event.name, event.time, old_passenger, new_passenger),
                environment,
            )

        for event in self.vehicle_notification_event_queue:
            vehicle = event._VehicleNotification__vehicle  # pylint: disable=protected-access
            route = event._VehicleNotification__route  # pylint: disable=protected-access

            old_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            new_vehicle = VisualizedVehicle.from_vehicle_and_route(vehicle, route)

            self.add_update(
                VehicleUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_vehicle,
                    new_vehicle,
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
    ) -> None:
        # In case that a queued event is not linked to EnvironmentIdle
        if self.has_to_flush and event.time > self.last_queued_event_time:
            self.flush(environment)

        # Optimize
        if isinstance(event, Optimize):
            return

        # EnvironmentUpdate
        if isinstance(event, EnvironmentUpdate):
            return

        # EnvironmentIdle
        if isinstance(event, EnvironmentIdle):
            # Now that the optimisations are done, we can flush the queued events.
            self.flush(environment)

            return

        # PassengerRelease
        if isinstance(event, PassengerRelease):
            old_passenger = self.visualized_environment.get_passenger(event.trip.id)
            new_passenger = VisualizedPassenger.from_trip_and_environment(event.trip, environment)

            self.add_update(
                PassengerUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_passenger,
                    new_passenger,
                ),
                environment,
            )

            return

        # PassengerAssignment
        if isinstance(event, PassengerAssignment):
            self.passenger_assignment_event_queue.append(event)

            self.last_queued_event_time = event.time

            return

        # PassengerReady
        if isinstance(event, PassengerReady):
            old_passenger = self.visualized_environment.get_passenger(event.state_machine.owner.id)
            new_passenger = VisualizedPassenger.from_trip_and_environment(event.state_machine.owner, environment)

            self.add_update(
                PassengerUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_passenger,
                    new_passenger,
                ),
                environment,
            )

            return

        # PassengerToBoard
        if isinstance(event, PassengerToBoard):
            old_passenger = self.visualized_environment.get_passenger(event.state_machine.owner.id)
            new_passenger = VisualizedPassenger.from_trip_and_environment(event.state_machine.owner, environment)

            self.add_update(
                PassengerUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_passenger,
                    new_passenger,
                ),
                environment,
            )

            return

        # PassengerAlighting
        if isinstance(event, PassengerAlighting):
            old_passenger = self.visualized_environment.get_passenger(event.state_machine.owner.id)
            new_passenger = VisualizedPassenger.from_trip_and_environment(event.state_machine.owner, environment)

            self.add_update(
                PassengerUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_passenger,
                    new_passenger,
                ),
                environment,
            )

            return

        # VehicleWaiting
        if isinstance(event, VehicleWaiting):
            vehicle = event.state_machine.owner
            route = event._VehicleWaiting__route  # pylint: disable=protected-access

            old_vehicle = self.visualized_environment.get_vehicle(event.state_machine.owner.id)
            new_vehicle = VisualizedVehicle.from_vehicle_and_route(vehicle, route)

            self.add_update(
                VehicleUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_vehicle,
                    new_vehicle,
                ),
                environment,
            )

            return

        # VehicleBoarding
        if isinstance(event, VehicleBoarding):
            vehicle = event.state_machine.owner
            route = event._VehicleBoarding__route  # pylint: disable=protected-access

            old_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            new_vehicle = VisualizedVehicle.from_vehicle_and_route(vehicle, route)

            self.add_update(
                VehicleUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_vehicle,
                    new_vehicle,
                ),
                environment,
            )

            return

        # VehicleDeparture
        if isinstance(event, VehicleDeparture):
            route = event._VehicleDeparture__route  # pylint: disable=protected-access
            vehicle = event.state_machine.owner

            old_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            new_vehicle = VisualizedVehicle.from_vehicle_and_route(vehicle, route)

            self.add_update(
                VehicleUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_vehicle,
                    new_vehicle,
                ),
                environment,
            )

            return

        # VehicleArrival
        if isinstance(event, VehicleArrival):
            route = event._VehicleArrival__route  # pylint: disable=protected-access
            vehicle = event.state_machine.owner

            old_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            new_vehicle = VisualizedVehicle.from_vehicle_and_route(vehicle, route)

            self.add_update(
                VehicleUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_vehicle,
                    new_vehicle,
                ),
                environment,
            )

            return

        # VehicleComplete
        if isinstance(event, VehicleComplete):
            vehicle = event.state_machine.owner
            route = event._VehicleComplete__route  # pylint: disable=protected-access

            old_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            new_vehicle = VisualizedVehicle.from_vehicle_and_route(vehicle, route)

            self.add_update(
                VehicleUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_vehicle,
                    new_vehicle,
                ),
                environment,
            )

            return

        # VehicleReady
        if isinstance(event, VehicleReady):
            vehicle = event._VehicleReady__vehicle  # pylint: disable=protected-access
            route = event._VehicleReady__route  # pylint: disable=protected-access

            old_vehicle = self.visualized_environment.get_vehicle(vehicle.id)
            new_vehicle = VisualizedVehicle.from_vehicle_and_route(vehicle, route)

            self.add_update(
                VehicleUpdate(
                    self.update_counter,
                    event.index,
                    event.name,
                    event.time,
                    old_vehicle,
                    new_vehicle,
                ),
                environment,
            )

            return

        # VehicleNotification
        if isinstance(event, VehicleNotification):
            self.vehicle_notification_event_queue.append(event)

            self.last_queued_event_time = event.time

            return

        # VehicleBoarded
        if isinstance(event, VehicleBoarded):
            return

        # VehicleAlighted
        if isinstance(event, VehicleAlighted):
            return

        # VehicleUpdatePositionEvent
        if isinstance(event, VehicleUpdatePositionEvent):
            return

        # RecurrentTimeSyncEvent
        if isinstance(event, RecurrentTimeSyncEvent):
            return

        # Hold
        if isinstance(event, Hold):
            return

        raise NotImplementedError(f"Event {event.name} not handled by the data collector")

    # MARK: +- Clean Up
    def clean_up(self, env):
        self.simulation_information.simulation_end_time = self.visualized_environment.timestamp
        self.simulation_information.last_update_index = self.visualized_environment.update_index

        SimulationVisualizationDataManager.set_simulation_information(self.simulation_id, self.simulation_information)

        if self.stop_event is not None:
            self.stop_event.set()

        if self.connection_thread is not None:
            self.connection_thread.join()

        if self.is_connected:
            self.sio.disconnect()

        if self.sio is not None:
            self.sio.wait()
