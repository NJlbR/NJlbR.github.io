/*
  # Включение Realtime для таблицы сообщений

  1. Изменения
    - Включаем публикацию Realtime событий для таблицы messages
    - Включаем публикацию Realtime событий для таблицы conversations

  2. Назначение
    - Позволяет приложению получать новые сообщения в реальном времени
    - Обновление списка диалогов при получении новых сообщений
*/

-- Включаем Realtime для таблицы messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Включаем Realtime для таблицы conversations
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
