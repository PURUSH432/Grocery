import os
from contextlib import contextmanager
from typing import Iterator

import psycopg
from dotenv import load_dotenv

load_dotenv()


def get_connection() -> psycopg.Connection:
    """Create a new connection to the GoQuick PostgreSQL database."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg.connect(database_url)
    return psycopg.connect(host=os.getenv("DB_HOST", "localhost"), port=int(os.getenv("DB_PORT", "5432")), dbname=os.getenv("DB_NAME", "goquick"), user=os.getenv("DB_USER", "postgres"), password=os.getenv("DB_PASSWORD", ""), sslmode=os.getenv("DB_SSL", "disable"))


@contextmanager
def database_connection() -> Iterator[psycopg.Connection]:
    """Yield a connection and close it after use."""
    connection = get_connection()
    try:
        yield connection
    finally:
        connection.close()


if __name__ == "__main__":
    with database_connection() as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT current_database(), version()")
        database_name, version = cursor.fetchone()
        cursor.close()
        print(f"Connected to {database_name} using PostgreSQL {version}")
