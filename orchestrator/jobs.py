import uuid
from sqlalchemy.orm import Session
from models import Job 

def create_job(db: Session, user_id: str, filename: str, script_path: str, data_path: str = None, weights_path: str = None):
    job_id = str(uuid.uuid4())
    new_job = Job(
        job_id=job_id, user_id=user_id, filename=filename, status="queued",
        worker_id=None, script_path=script_path, data_path=data_path, weights_path=weights_path
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    return job_id

def assign_job(db: Session, job_id: str, worker_id: str):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.worker_id = worker_id
        job.status = "running"
        db.commit()

def complete_job(db: Session, job_id: str, result: str):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.status = "completed"
        job.result = result
        db.commit()

def fail_job(db: Session, job_id: str, error: str):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.status = "failed"
        job.error = error
        db.commit()

def requeue_job(db: Session, job_id: str):
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if job:
        job.status = "queued"
        job.worker_id = None
        db.commit()

def get_all_jobs(db: Session):
    return db.query(Job).all()