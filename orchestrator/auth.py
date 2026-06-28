import os
import hashlib
import bcrypt
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from jose import jwt, JWTError


SQLALCHEMY_DATABASE_URL = "sqlite:///./auth.db"  
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLAlchemy User Model
class DBUser(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    
    # Profile & Account Info
    display_name = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().strftime("%B %d, %Y"))
    plan = Column(String, default="Free")
    
    # Cluster Access
    role = Column(String, default="Viewer")
    api_access = Column(String, default="Read-only")
    max_workers = Column(Integer, default=5)

# Create the database tables
Base.metadata.create_all(bind=engine)

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------
# 2. PASSWORD HASHING SETUP
# ---------------------------------------------------------
def verify_password(plain_password, hashed_password):
    # Pre-hash with SHA-256 to bypass bcrypt's 72-byte limit safely.
    pre_hashed = hashlib.sha256(plain_password.encode('utf-8')).hexdigest().encode('utf-8')
    return bcrypt.checkpw(pre_hashed, hashed_password.encode('utf-8'))

def get_password_hash(password):
    # Pre-hash with SHA-256 to bypass bcrypt's 72-byte limit safely.
    pre_hashed = hashlib.sha256(password.encode('utf-8')).hexdigest().encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pre_hashed, salt).decode('utf-8')


# ---------------------------------------------------------
# 3. JWT TOKEN & AUTH SECURITY SETUP
# ---------------------------------------------------------
SECRET_KEY = "your-super-secret-key-change-this-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 1 week expiration

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Dependency to get the currently logged-in user using the Token
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


# ---------------------------------------------------------
# 4. PYDANTIC SCHEMAS (For request validation)
# ---------------------------------------------------------
class UserSignup(BaseModel):
    username: str
    email: str # Added to match Create Account screen
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


# ---------------------------------------------------------
# 5. FASTAPI ROUTES
# ---------------------------------------------------------
router = APIRouter()

@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(user: UserSignup, db: Session = Depends(get_db)):
    # 1. Check if username OR email already exists
    if db.query(DBUser).filter(DBUser.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if db.query(DBUser).filter(DBUser.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. Hash the password
    hashed_pw = get_password_hash(user.password)
    
    # 3. Save to database
    new_user = DBUser(username=user.username, email=user.email, hashed_password=hashed_pw)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created successfully"}


@router.post("/login", response_model=TokenResponse)
def login(user: UserLogin, db: Session = Depends(get_db)):
    # 1. Find user in the database
    db_user = db.query(DBUser).filter(DBUser.username == user.username).first()
    
    # 2. Verify existence and password
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    
    # 3. Create access token
    access_token = create_access_token(data={"sub": db_user.username})
    
    return {"access_token": access_token, "token_type": "bearer"}


# --- NEW PROFILE ROUTES ---

@router.get("/profile")
def get_profile(current_user: DBUser = Depends(get_current_user)):
    """Returns the profile data needed for the Profile screen"""
    return {
        "username": current_user.username,
        "email": current_user.email,
        "display_name": current_user.display_name or current_user.username,
        "bio": current_user.bio or "",
        "created_at": current_user.created_at,
        "plan": current_user.plan,
        "role": current_user.role,
        "api_access": current_user.api_access,
        "max_workers": current_user.max_workers
    }

@router.put("/profile")
def update_profile(profile_data: ProfileUpdate, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user)):
    """Updates the display name and bio"""
    current_user.display_name = profile_data.display_name
    current_user.bio = profile_data.bio
    db.commit()
    return {"message": "Profile updated successfully"}