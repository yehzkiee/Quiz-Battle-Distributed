# Database Schema

## users

~~~sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  points INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
~~~

## matches

~~~sql
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(100) UNIQUE NOT NULL,
  player_one_id INT NOT NULL,
  player_two_id INT NOT NULL,
  winner_id INT,
  status VARCHAR(50) DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP
);
~~~

## match_results

~~~sql
CREATE TABLE match_results (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL,
  user_id INT NOT NULL,
  score INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  wrong_answers INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
~~~

## questions

~~~sql
CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  answer VARCHAR(255) NOT NULL,
  difficulty VARCHAR(50) DEFAULT 'normal'
);
~~~

User Service terhubung ke PGPool melalui DB_HOST=pgpool. PGPool diarahkan ke PostgreSQL primary dan standby.
