import os
import datetime


active_simulations = {}

def register_log(simulation_name, log_message):
    folder_name = "saved_logs"
    os.makedirs(folder_name, exist_ok=True)

    if simulation_name not in active_simulations:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"{simulation_name}_{timestamp}.txt"
        active_simulations[simulation_name] = unique_filename
    else:
        unique_filename = active_simulations[simulation_name]

    file_path = os.path.join(folder_name, unique_filename)

    with open(file_path, "a") as file:
        file.write(log_message + "\n")