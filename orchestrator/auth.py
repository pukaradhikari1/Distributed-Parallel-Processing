import os
import hashlib
import bcrypt
import random
import smtplib
import uuid
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from dotenv import load_dotenv

from schemas import (
    UserSignup, UserLogin, TokenResponse, ProfileUpdate, 
    SendOTPRequest, VerifyOTPRequest
)
from database import Base, get_db

load_dotenv()

class DBUser(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    display_name = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    # Modernized date generation tracking
    created_at = Column(String, default=lambda: datetime.now(timezone.utc).strftime("%B %d, %Y"))
    plan = Column(String, default="Free")
    
    role = Column(String, default="Viewer")
    api_access = Column(String, default="Read-only")
    max_workers = Column(Integer, default=5)

    is_verified = Column(Boolean, default=False)
    otp_code = Column(String, nullable=True)
    otp_expire_at = Column(DateTime, nullable=True)


SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "your_email@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "your_app_password")

def send_email_background(to_email: str, subject: str, body: str):
    try:
        msg = EmailMessage()
        msg.set_content(body)
        msg['Subject'] = subject
        msg['From'] = SMTP_USER
        msg['To'] = to_email

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"OTP successfully sent to {to_email}")
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")


def verify_password(plain_password, hashed_password):
    pre_hashed = hashlib.sha256(plain_password.encode('utf-8')).hexdigest().encode('utf-8')
    return bcrypt.checkpw(pre_hashed, hashed_password.encode('utf-8'))

def get_password_hash(password):
    pre_hashed = hashlib.sha256(password.encode('utf-8')).hexdigest().encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pre_hashed, salt).decode('utf-8')


SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-change-this-in-production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def create_access_token(data: dict):
    to_encode = data.copy()
    # Updated to modern timezone standard
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(DBUser).filter(DBUser.username == username).first()
    if user is None:
        raise credentials_exception
    return user


router = APIRouter()

@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(user: UserSignup, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if db.query(DBUser).filter(DBUser.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if db.query(DBUser).filter(DBUser.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pw = get_password_hash(user.password)
    new_user = DBUser(username=user.username, email=user.email, hashed_password=hashed_pw)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created successfully. Please verify your email."}


@router.post("/login", response_model=TokenResponse)
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(DBUser).filter(DBUser.username == user.username).first()
    
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
        
    if not db_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account not verified. Please verify your email using the OTP sent to you before logging in."
        )
    
    access_token = create_access_token(data={"sub": db_user.username})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/send-otp")
def send_otp(req: SendOTPRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp = "".join(random.choices("0123456789", k=6))
    
    user.otp_code = otp
    # Strips explicit timezone info to match naive SQLAlchemy target storage
    user.otp_expire_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10)
    db.commit()

    email_body = f"Hello {user.username},\n\nYour verification code is: {otp}\n\nThis code will expire in 10 minutes."
    background_tasks.add_task(send_email_background, user.email, "Your OTP Verification Code", email_body)

    return {"message": "OTP sent successfully to your email."}


@router.post("/verify-otp")
def verify_otp(req: VerifyOTPRequest, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter(DBUser.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.otp_code or user.otp_code != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    # Fixed comparison tracking utilizing matching naive time objects
    if user.otp_expire_at and datetime.now(timezone.utc).replace(tzinfo=None) > user.otp_expire_at:
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")

    user.is_verified = True
    user.otp_code = None       
    user.otp_expire_at = None  
    db.commit()

    return {"message": "Email verified successfully"}


@router.get("/profile")
def get_profile(current_user: DBUser = Depends(get_current_user)):
    
    member_date = current_user.created_at if current_user.created_at else "July 19, 2026"
    
    return {
        "username": current_user.username,
        "email": current_user.email, 
        "is_verified": current_user.is_verified, 
        "display_name": current_user.display_name or current_user.username,
        "bio": current_user.bio or "",
        
        "created_at": member_date,      
        "member_since": member_date,   
        
        "plan": current_user.plan,
        "role": current_user.role,
        "api_access": current_user.api_access,
        "max_workers": current_user.max_workers
    }


@router.put("/profile")
def update_profile(profile_data: ProfileUpdate, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user)):
    current_user.display_name = profile_data.display_name
    current_user.bio = profile_data.bio
    db.commit()
    return {"message": "Profile updated successfully"}


@router.delete("/delete-account")
def delete_account(current_user: DBUser = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(current_user)
    db.commit()
    return {"message": "Account successfully deleted"}