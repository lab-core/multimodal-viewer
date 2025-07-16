from json import loads


# MARK: Serializable
class Serializable:
    def serialize(self) -> dict:
        """
        Serialize the instance into a dictionary.

        This method should be implemented by subclasses.
        """

    @classmethod
    def deserialize(cls, serialized_data: dict | str) -> "Serializable":
        """
        Deserialize a dictionary into an instance of the class.

        If the dictionary is not valid, raise a `ValueError`.

        This method should be implemented by subclasses.
        """

    @staticmethod
    def serialized_data_to_dict(serialized_data: dict | str) -> dict:
        """
        Parse the serialized data into a dictionary if it is a string.

        This method should be called before each deserialization.
        """
        if isinstance(serialized_data, str):
            return loads(serialized_data)
        return serialized_data

    @staticmethod
    def verify_required_fields(serialized_data: dict, required_fields: list[str], class_name: str) -> None:
        """
        Verify that the serialized data contains all required fields.

        If any field is missing, raise a `ValueError`.
        """
        for field in required_fields:
            if field not in serialized_data:
                raise ValueError(f"Serialized data of {class_name} must contain '{field}' key")
