/*
  # Добавление ограничений и лимитов в базу данных

  1. Изменения
    - Добавляем ограничения длины для текстовых полей
    - Добавляем CHECK constraints для валидации данных
    - Улучшаем индексы для производительности
    
  2. Безопасность
    - Ограничение длины для защиты от переполнения
    - Валидация данных на уровне базы данных
    - Защита от некорректных данных
*/

-- Добавляем ограничения длины для user_profiles
ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS username_length_check,
ADD CONSTRAINT username_length_check CHECK (char_length(username) >= 4 AND char_length(username) <= 30);

ALTER TABLE user_profiles
DROP CONSTRAINT IF EXISTS username_format_check,
ADD CONSTRAINT username_format_check CHECK (username ~ '^[a-z0-9_]+$');

-- Добавляем ограничения для постов
ALTER TABLE posts
DROP CONSTRAINT IF EXISTS title_length_check,
ADD CONSTRAINT title_length_check CHECK (char_length(title) > 0 AND char_length(title) <= 500);

ALTER TABLE posts
DROP CONSTRAINT IF EXISTS content_length_check,
ADD CONSTRAINT content_length_check CHECK (char_length(content) <= 100000);

ALTER TABLE posts
DROP CONSTRAINT IF EXISTS description_length_check,
ADD CONSTRAINT description_length_check CHECK (description IS NULL OR char_length(description) <= 50000);

-- Добавляем ограничения для аннотаций
ALTER TABLE annotations
DROP CONSTRAINT IF EXISTS term_length_check,
ADD CONSTRAINT term_length_check CHECK (char_length(term) > 0 AND char_length(term) <= 200);

ALTER TABLE annotations
DROP CONSTRAINT IF EXISTS annotation_content_length_check,
ADD CONSTRAINT annotation_content_length_check CHECK (content IS NULL OR char_length(content) <= 50000);

-- Добавляем ограничения для комментариев
ALTER TABLE comments
DROP CONSTRAINT IF EXISTS comment_length_check,
ADD CONSTRAINT comment_length_check CHECK (char_length(content) >= 2 AND char_length(content) <= 5000);

-- Добавляем ограничения для хэштегов и персон
ALTER TABLE hashtags
DROP CONSTRAINT IF EXISTS hashtag_name_length_check,
ADD CONSTRAINT hashtag_name_length_check CHECK (char_length(name) > 0 AND char_length(name) <= 50);

ALTER TABLE persons
DROP CONSTRAINT IF EXISTS person_name_length_check,
ADD CONSTRAINT person_name_length_check CHECK (char_length(name) > 0 AND char_length(name) <= 100);

-- Создаем функцию для очистки истекших модераций
CREATE OR REPLACE FUNCTION cleanup_expired_moderations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM user_moderation
  WHERE expires_at IS NOT NULL
  AND expires_at < now();
END;
$$;

-- Добавляем индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_annotations_term_lower ON annotations(LOWER(term));
CREATE INDEX IF NOT EXISTS idx_hashtags_name_lower ON hashtags(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_persons_name_lower ON persons(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_posts_content_types ON posts USING GIN (content_types);

-- Добавляем проверку для предотвращения самомодерации админов
CREATE OR REPLACE FUNCTION prevent_admin_self_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id = NEW.moderated_by THEN
    RAISE EXCEPTION 'Вы не можете модерировать самого себя';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_self_moderation ON user_moderation;
CREATE TRIGGER check_self_moderation
  BEFORE INSERT ON user_moderation
  FOR EACH ROW
  EXECUTE FUNCTION prevent_admin_self_moderation();

-- Создаем триггер для автоматической очистки старых модераций при чтении
CREATE OR REPLACE FUNCTION auto_cleanup_expired_moderations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM cleanup_expired_moderations();
  RETURN NEW;
END;
$$;

-- Комментируем создание триггера на SELECT, так как это не поддерживается
-- Вместо этого, очистка будет происходить при вставке новых модераций
DROP TRIGGER IF EXISTS auto_cleanup_on_moderation_insert ON user_moderation;
CREATE TRIGGER auto_cleanup_on_moderation_insert
  AFTER INSERT ON user_moderation
  FOR EACH STATEMENT
  EXECUTE FUNCTION auto_cleanup_expired_moderations();
