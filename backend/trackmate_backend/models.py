import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[A-Za-z]{2,}$")
Relationship = Literal["FAMILY", "FRIEND", "TRAVEL_BUDDY", "ORGANIZER", "OTHER"]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]


def normalize_phone(value: str) -> str:
    v = value.strip()
    if not re.fullmatch(r"\+?[\d\s\-().]+", v):
        raise ValueError("phone may contain only digits, spaces, + - ( ) .")
    digits = re.sub(r"\D", "", v)
    if not 7 <= len(digits) <= 15:
        raise ValueError("phone must have 7 to 15 digits")
    return ("+" if v.startswith("+") else "") + digits


def normalize_email(value: str) -> str:
    v = value.strip().lower()
    if len(v) > 254 or not EMAIL_RE.match(v):
        raise ValueError("enter a valid email address")
    return v


def check_password(password: str, email: str | None = None) -> str:
    if len(password) < 10:
        raise ValueError("password must be at least 10 characters")
    if len(password) > 128:
        raise ValueError("password must be at most 128 characters")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ValueError("password must contain letters and numbers")
    if email and email.split("@")[0].lower() in password.lower() and len(email.split("@")[0]) >= 3:
        raise ValueError("password must not contain your email name")
    return password


class EmergencyContactIn(BaseModel):
    name: Name
    phone: str
    relationship: Relationship

    _phone = field_validator("phone")(normalize_phone)


class ConsentIn(BaseModel):
    type: str
    version: str
    accepted: bool


class RegisterIn(BaseModel):
    full_name: Name
    email: str
    phone: str
    password: str
    emergency_contact: EmergencyContactIn
    consents: list[ConsentIn] = Field(min_length=1, max_length=10)

    _email = field_validator("email")(normalize_email)
    _phone = field_validator("phone")(normalize_phone)

    @field_validator("password")
    @classmethod
    def _pw(cls, v, info):
        return check_password(v, info.data.get("email"))


class LoginIn(BaseModel):
    identifier: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class ForgotIn(BaseModel):
    identifier: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]


class ResetIn(BaseModel):
    identifier: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    code: Annotated[str, StringConstraints(pattern=r"^\d{6}$")]
    new_password: str


def identifier_key(identifier: str) -> tuple[str, str]:
    """Returns ('email', value) or ('phone', value) for login/reset lookups."""
    if "@" in identifier:
        return "email", normalize_email(identifier)
    return "phone", normalize_phone(identifier)
