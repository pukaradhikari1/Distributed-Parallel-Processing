from pydantic import BaseModel, Field, EmailStr

class UserSignup(BaseModel):
    username: str
    email: EmailStr 
    password: str = Field(max_length=1000)

class UserLogin(BaseModel):
    username: str
    password: str = Field(max_length=1000)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class ProfileUpdate(BaseModel):
    display_name: str
    bio: str

class SendOTPRequest(BaseModel):
    email: EmailStr

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str