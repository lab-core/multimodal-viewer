import os


def register_log(simulation_id, message):
    current_directory = os.path.dirname(os.path.abspath(__file__))
    log_directory_name = "saved_logs"
    log_directory_path = f"{current_directory}/{log_directory_name}"
    file_name = f"{simulation_id}.txt"
    file_path = f"{log_directory_path}/{file_name}"

    if not os.path.exists(log_directory_path):
        os.makedirs(log_directory_path)

    with open(file_path, "a") as file:
        file.write(message + "\n")
