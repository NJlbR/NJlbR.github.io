import { useEffect, useState, memo, useCallback } from 'react';
import { Filter, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface FiltersProps {
  onFilterChange: (filters: FilterState) => void;
}

export interface FilterState {
  contentType: string;
  hashtag: string;
  person: string;
  dateFrom: string;
  dateTo: string;
}

function FiltersContent({ onFilterChange }: FiltersProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    contentType: '',
    hashtag: '',
    person: '',
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => {
    async function fetchFilterOptions() {
      const [hashtagsRes, personsRes] = await Promise.all([
        supabase.from('hashtags').select('name').order('name'),
        supabase.from('persons').select('name').order('name'),
      ]);

      if (hashtagsRes.data) setHashtags(hashtagsRes.data.map((h: { name: string }) => h.name));
      if (personsRes.data) setPersons(personsRes.data.map((p: { name: string }) => p.name));
    }

    fetchFilterOptions();
  }, []);

  const handleFilterChange = useCallback((key: keyof FilterState, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      onFilterChange(newFilters);
      return newFilters;
    });
  }, [onFilterChange]);

  const clearFilters = useCallback(() => {
    const emptyFilters: FilterState = {
      contentType: '',
      hashtag: '',
      person: '',
      dateFrom: '',
      dateTo: '',
    };
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  }, [onFilterChange]);

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6 transition-colors">
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 text-gray-900 dark:text-white font-medium w-full justify-between"
      >
        <div className="flex items-center gap-2">
          <Filter size={20} />
          <span>Фильтры</span>
          {hasActiveFilters && (
            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
              Активны
            </span>
          )}
        </div>
        <span className="text-gray-500 dark:text-gray-400">
          {showFilters ? '▲' : '▼'}
        </span>
      </button>

      {showFilters && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Тип контента
            </label>
            <select
              value={filters.contentType}
              onChange={(e) => handleFilterChange('contentType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Все</option>
              <option value="text">Текст</option>
              <option value="audio">Аудио</option>
              <option value="video">Видео</option>
              <option value="photo">Фото</option>
              <option value="file">Файл</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Хэштег
            </label>
            <select
              value={filters.hashtag}
              onChange={(e) => handleFilterChange('hashtag', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Все</option>
              {hashtags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Персона
            </label>
            <select
              value={filters.person}
              onChange={(e) => handleFilterChange('person', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Все</option>
              {persons.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Дата от
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Дата до
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              <X size={20} />
              <span>Сбросить</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const Filters = memo(FiltersContent);
