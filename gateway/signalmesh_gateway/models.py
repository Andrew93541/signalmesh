from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

Category = Literal["MEDICAL", "RESCUE", "GENERAL"]
Priority = Literal["HIGH", "MEDIUM", "LOW"]
NodeId = Annotated[str, StringConstraints(min_length=1, max_length=64, strip_whitespace=True)]
Name = Annotated[str, StringConstraints(min_length=1, max_length=80, strip_whitespace=True)]


def _check_iso(value: str) -> str:
    try:
        datetime.fromisoformat(value)
    except ValueError as e:
        raise ValueError("must be an ISO-8601 date-time") from e
    return value


class _Located(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def _both_or_neither(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must both be numbers or both be null")
        return self


class SosIn(_Located):
    model_config = ConfigDict(extra="ignore")

    message_id: str = Field(pattern=r"^SM-[A-Za-z0-9-]{6,64}$")
    device_id: NodeId
    worker_name: Name
    category: Category
    priority: Priority
    description: str | None = Field(default=None, max_length=500)
    created_at: str  # kept exactly as the phone sent it
    hop_count: int = Field(default=0, ge=0, le=16)
    hops: list[NodeId] = Field(default_factory=list, max_length=16)
    status: str | None = None  # informational; each hop sets its own
    # Location metadata (v1.1, additive). Kept exactly as the phone captured it.
    location_accuracy_m: float | None = Field(default=None, ge=0, le=100_000)
    location_recorded_at: str | None = None
    location_source: Literal["DEVICE", "DEVICE_LAST_KNOWN"] | None = None
    location_is_last_known: bool | None = None
    user_id: str | None = Field(default=None, max_length=64)

    _iso = field_validator("created_at")(_check_iso)

    @field_validator("location_recorded_at")
    @classmethod
    def _loc_iso(cls, v):
        return _check_iso(v) if v is not None else v

    @model_validator(mode="after")
    def _metadata_needs_fix(self):
        if self.latitude is None and (self.location_accuracy_m is not None or self.location_recorded_at is not None):
            raise ValueError("location metadata without coordinates")
        return self


class CheckinIn(_Located):
    model_config = ConfigDict(extra="ignore")

    device_id: NodeId
    worker_name: Name
    checked_in_at: str
    interval_minutes: int = Field(ge=1, le=24 * 60)

    _iso = field_validator("checked_in_at")(_check_iso)


class AckIn(BaseModel):
    acknowledged_by: Name


class ResolveIn(BaseModel):
    resolved_by: Name
    note: str | None = Field(default=None, max_length=500)


class NodeHeartbeatIn(BaseModel):
    node_id: NodeId
    role: Literal["relay", "gateway", "sender"] = "relay"
    label: str | None = Field(default=None, max_length=80)
    queue_size: int = Field(default=0, ge=0)


class PeerAckIn(BaseModel):
    """A nearby TrackMate user acknowledged an SOS on their phone (not a responder acknowledgement)."""
    model_config = ConfigDict(extra="ignore")
    message_id: str = Field(pattern=r"^SM-[A-Za-z0-9-]{6,64}$")
    recipient_device_id: NodeId
    recipient_name: Name | None = None
    recipient_user_id: str | None = Field(default=None, max_length=64)
    acknowledged_at: str

    _iso = field_validator("acknowledged_at")(_check_iso)
