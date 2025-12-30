
const BASE_URL = 'https://api.open-meteo.com/v1';
const GEOCODE_API = 'https://geocoding-api.open-meteo.com/v1/search';
/*const DEFAULT_CITIES = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону'];*/

const elements = {
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    mainContent: document.getElementById('mainContent'),
    errorMessage: document.getElementById('errorMessage'),
    citiesSidebar: document.getElementById('citiesSidebar'),
    currentTime: document.getElementById('currentTime'),

    refreshBtn: document.getElementById('refreshBtn'),
    addCityBtn: document.getElementById('addCityBtn'),
    retryBtn: document.getElementById('retryBtn'),
    menuToggle: document.getElementById('menuToggle'),
    mobileOverlay: document.getElementById('mobileOverlay'),

    currentCity: document.getElementById('currentCity'),
    currentTemp: document.getElementById('currentTemp'),
    weatherIcon: document.getElementById('weatherIcon'),
    weatherDescription: document.getElementById('weatherDescription'),
    windSpeed: document.getElementById('windSpeed'),
    humidity: document.getElementById('humidity'),
    pressure: document.getElementById('pressure'),
    feelsLike: document.getElementById('feelsLike'),

    forecastContainer: document.getElementById('forecastContainer'),

    addCityModal: document.getElementById('addCityModal'),
    cityInput: document.getElementById('cityInput'),
    citySuggestions: document.getElementById('citySuggestions'),
    cityError: document.getElementById('cityError'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    saveCityBtn: document.getElementById('saveCityBtn')
};

const state = {
    cities: [],
    currentCityIndex: 0,
    weatherData: {},
    cityCoords: {},
    cityTimezones: {},
    cityLocalTimes: {},
    cityTimers: {} 
};

function init() {
    loadState();
    setupEventListeners();
    checkScreenWidth();

    if (state.cities.length > 0) {
        loadWeatherForCity(state.cities[state.currentCityIndex]);
    } else {
        requestGeolocation();
    }
}

function loadState() {
    const savedState = localStorage.getItem('weatherAppState');
    if (savedState) {
        const parsedState = JSON.parse(savedState);
        state.cities = parsedState.cities || [];
        state.currentCityIndex = parsedState.currentCityIndex || 0;
        state.cityCoords = parsedState.cityCoords || {};
        state.cityTimezones = parsedState.cityTimezones || {};

        Object.keys(state.cityTimezones).forEach(cityName => {
            if (state.cityTimezones[cityName]) {
                startCityTimeUpdate(cityName, state.cityTimezones[cityName]);
            }
        });
    }
}

function saveState() {
    localStorage.setItem('weatherAppState', JSON.stringify({
        cities: state.cities,
        currentCityIndex: state.currentCityIndex,
        cityCoords: state.cityCoords,
        cityTimezones: state.cityTimezones
    }));
}

function setupEventListeners() {
    elements.refreshBtn.addEventListener('click', () => {
        refreshWeather();
    });

    elements.addCityBtn.addEventListener('click', () => {
        showAddCityModal();
    });

    elements.retryBtn.addEventListener('click', () => {
        if (state.cities.length > 0) {
            loadWeatherForCity(state.cities[state.currentCityIndex]);
        } else {
            requestGeolocation();
        }
    });

    elements.closeModalBtn.addEventListener('click', hideAddCityModal);
    elements.cancelBtn.addEventListener('click', hideAddCityModal);

    elements.saveCityBtn.addEventListener('click', saveCity);

    elements.cityInput.addEventListener('input', handleCityInput);

    elements.addCityModal.addEventListener('click', (e) => {
        if (e.target === elements.addCityModal) {
            hideAddCityModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.addCityModal.classList.contains('hidden')) {
            hideAddCityModal();
        }
    });

    elements.menuToggle.addEventListener('click', toggleMobileMenu);
    elements.mobileOverlay.addEventListener('click', closeMobileMenu);

    document.addEventListener('click', (e) => {
        if (e.target.closest('.city-card') && window.innerWidth <= 992) {
            closeMobileMenu();
        }
    });
}

function toggleMobileMenu() {
    const citiesSidebar = document.getElementById('citiesSidebar');
    const overlay = document.getElementById('mobileOverlay');

    citiesSidebar.classList.toggle('active');
    overlay.classList.toggle('active');

    const icon = elements.menuToggle.querySelector('i');
    if (citiesSidebar.classList.contains('active')) {
        icon.className = 'fas fa-times';
    } else {
        icon.className = 'fas fa-bars';
    }
}

function closeMobileMenu() {
    const citiesSidebar = document.getElementById('citiesSidebar');
    const overlay = document.getElementById('mobileOverlay');

    citiesSidebar.classList.remove('active');
    overlay.classList.remove('active');

    const icon = elements.menuToggle.querySelector('i');
    icon.className = 'fas fa-bars';
}

function checkScreenWidth() {
    if (window.innerWidth > 992) {
        closeMobileMenu();
    }
}

function requestGeolocation() {
    showLoading();

    if (!navigator.geolocation) {
        showError('Геолокация не поддерживается вашим браузером');
        showAddCityModal();
        return;
    }

    const options = {
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 0 
    };

    navigator.geolocation.getCurrentPosition(
   
        async (position) => {
            const { latitude, longitude } = position.coords;

           
            showLoading();
            elements.loadingState.querySelector('p').textContent = 'Определяем ваше местоположение...';

            try {
                await loadWeatherByCoords(latitude, longitude);
            } catch (error) {
                console.error('Ошибка при загрузке погоды:', error);
                showError('Не удалось загрузить погоду для вашего местоположения');
                showAddCityModal();
            }
        },
        
        (error) => {
            console.error('Геолокация отклонена или произошла ошибка:', error);

            let errorMessage = 'Разрешите доступ к геолокации для автоматического определения погоды.';

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Доступ к геолокации отклонен. Добавьте город вручную.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Информация о местоположении недоступна. Добавьте город вручную.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Превышено время ожидания определения местоположения. Добавьте город вручную.';
                    break;
            }

            showError(errorMessage);

            if (state.cities.length === 0) {
                
                setTimeout(() => {
                    showAddCityModal();
                }, 1500);
            } else {
                
                loadWeatherForCity(state.cities[state.currentCityIndex]);
            }
        },
        options
    );
}

async function getCityNameByCoords(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=ru`);

        if (!response.ok) {
            return "Текущее местоположение";
        }

        const data = await response.json();

        if (data && data.address) {
            const possibleNames = [
                data.address.city,
                data.address.town,
                data.address.village,
                data.address.municipality,
                data.address.county,
                data.address.state
            ];

            for (const name of possibleNames) {
                if (name && typeof name === 'string') {
                    return name;
                }
            }
        }

        return "Текущее местоположение";
    } catch (error) {
        console.error('Ошибка при определении города:', error);
        return "Текущее местоположение";
    }
}

async function loadWeatherByCoords(lat, lon) {
    try {
        let cityName = "Текущее местоположение";

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=ru`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.address) {
                    const city = data.address.city || data.address.town || data.address.village || data.address.municipality;
                    if (city) {
                        cityName = city;
                    } else if (data.address.state) {
                        cityName = data.address.state;
                    }
                }
            }
        } catch (geocodeError) {
            console.log('Не удалось определить название города, используем "Текущее местоположение"');
        }

        state.cityCoords[cityName] = { lat, lon };
        state.cityTimezones[cityName] = "Europe/Moscow"; // Дефолтный часовой пояс

        const data = await fetchWeatherData(lat, lon, cityName);

        if (!state.cities.includes(cityName)) {
            state.cities.unshift(cityName);
            state.currentCityIndex = 0;
            saveState();
        }

        state.weatherData[cityName] = data;

        displayWeatherData(data);
        updateCitiesSidebar();
        showMainContent();

        updateBackground(data);

    } catch (error) {
        console.error('Ошибка при загрузке погоды по координатам:', error);

        showError('Не удалось получить погоду для вашего местоположения. Добавьте город вручную.');
        setTimeout(() => {
            showAddCityModal();
        }, 1000);
    }
}
async function loadWeatherForCity(cityName) {
    showLoading();

    try {
        const cachedData = state.weatherData[cityName];
        const cacheTime = localStorage.getItem(`weatherCacheTime_${cityName}`);

        if (cachedData && cacheTime && (Date.now() - parseInt(cacheTime)) < 10 * 60 * 1000) {
          
            displayWeatherData(cachedData);
            updateCitiesSidebar();
            showMainContent();
            updateBackground(cachedData);
            return;
        }

        let lat, lon, timezone;

        if (state.cityCoords[cityName]) {
            lat = state.cityCoords[cityName].lat;
            lon = state.cityCoords[cityName].lon;
            timezone = state.cityTimezones[cityName];
        } else {
            const geocodeResponse = await fetch(
                `${GEOCODE_API}?name=${cityName}&language=ru&count=1`
            );

            if (!geocodeResponse.ok) {
                throw new Error('Ошибка при поиске города');
            }

            const geocodeData = await geocodeResponse.json();

            if (!geocodeData || !geocodeData.results || geocodeData.results.length === 0) {
                throw new Error('Город не найден');
            }

            const cityInfo = geocodeData.results[0];
            lat = cityInfo.latitude;
            lon = cityInfo.longitude;
            timezone = cityInfo.timezone || "Europe/Moscow";

            state.cityCoords[cityName] = { lat, lon };
            state.cityTimezones[cityName] = timezone;
            saveState();
        }

        const data = await fetchWeatherData(lat, lon, cityName);

        state.weatherData[cityName] = data;
        localStorage.setItem(`weatherCacheTime_${cityName}`, Date.now().toString());

        displayWeatherData(data);
        updateCitiesSidebar();
        showMainContent();

        updateBackground(data);

    } catch (error) {
        console.error('Ошибка при загрузке погоды:', error);
        showError(error.message);
    }
}

async function fetchWeatherData(lat, lon, cityName) {
    const forecastUrl = `${BASE_URL}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,pressure_msl,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;

    const response = await fetch(forecastUrl);

    if (!response.ok) {
        throw new Error('Ошибка при загрузке данных о погоде');
    }

    const data = await response.json();

    const timezone = data.timezone || "Europe/Moscow";

    state.cityTimezones[cityName] = timezone;

    startCityTimeUpdate(cityName, timezone);

    const currentWeather = getCurrentWeatherFromData(data);

    const forecastDays = getForecastFromData(data);

    return {
        location: {
            name: cityName,
            country: "RU"
        },
        current: currentWeather,
        forecast: {
            forecastday: forecastDays
        },
        timezone: timezone
    };
}

function getCurrentWeatherFromData(data) {
    const current = data.current;

    const weatherCode = current.weather_code;
    const weatherInfo = getWeatherInfo(weatherCode);

    const isDay = current.is_day === 1;

    return {
        temp_c: Math.round(current.temperature_2m),
        feelslike_c: Math.round(current.apparent_temperature),
        condition: {
            text: weatherInfo.description,
            code: weatherCode,
            icon: weatherInfo.icon
        },
        wind_kph: (current.wind_speed_10m * 3.6).toFixed(1), // м/с → км/ч
        humidity: current.relative_humidity_2m,
        pressure_mb: Math.round(current.pressure_msl),
        is_day: isDay ? 1 : 0
    };
}

function getForecastFromData(data) {
    const daily = data.daily;
    const forecastDays = [];

    for (let i = 0; i < 3 && i < daily.time.length; i++) {
        const weatherCode = daily.weather_code[i];
        const weatherInfo = getWeatherInfo(weatherCode);

        forecastDays.push({
            date: daily.time[i],
            day: {
                maxtemp_c: Math.round(daily.temperature_2m_max[i]),
                mintemp_c: Math.round(daily.temperature_2m_min[i]),
                condition: {
                    text: weatherInfo.description,
                    code: weatherCode,
                    icon: weatherInfo.icon
                }
            }
        });
    }

    return forecastDays;
}

function getWeatherInfo(weatherCode) {
    const weatherMap = {
        0: { description: "Ясно", icon: "clear" },
        1: { description: "В основном ясно", icon: "mainly-clear" },
        2: { description: "Переменная облачность", icon: "partly-cloudy" },
        3: { description: "Пасмурно", icon: "overcast" },
        45: { description: "Туман", icon: "fog" },
        48: { description: "Иней", icon: "rime-fog" },
        51: { description: "Легкая морось", icon: "drizzle" },
        53: { description: "Морось", icon: "drizzle" },
        55: { description: "Сильная морось", icon: "drizzle" },
        56: { description: "Ледяная морось", icon: "freezing-drizzle" },
        57: { description: "Сильная ледяная морось", icon: "freezing-drizzle" },
        61: { description: "Небольшой дождь", icon: "rain" },
        63: { description: "Дождь", icon: "rain" },
        65: { description: "Сильный дождь", icon: "rain" },
        66: { description: "Ледяной дождь", icon: "freezing-rain" },
        67: { description: "Сильный ледяной дождь", icon: "freezing-rain" },
        71: { description: "Небольшой снег", icon: "snow" },
        73: { description: "Снег", icon: "snow" },
        75: { description: "Сильный снег", icon: "snow" },
        77: { description: "Снежные зерна", icon: "snow-grains" },
        80: { description: "Небольшой ливень", icon: "rain-showers" },
        81: { description: "Ливень", icon: "rain-showers" },
        82: { description: "Сильный ливень", icon: "rain-showers" },
        85: { description: "Небольшой снегопад", icon: "snow-showers" },
        86: { description: "Сильный снегопад", icon: "snow-showers" },
        95: { description: "Гроза", icon: "thunderstorm" },
        96: { description: "Гроза с небольшим градом", icon: "thunderstorm-hail" },
        99: { description: "Гроза с сильным градом", icon: "thunderstorm-hail" }
    };

    return weatherMap[weatherCode] || { description: "Неизвестно", icon: "clear" };
}

function getWeatherIconClass(weatherCode, isDay = 1) {
    const iconMap = {
        0: isDay ? 'fas fa-sun' : 'fas fa-moon', // Ясно
        1: isDay ? 'fas fa-cloud-sun' : 'fas fa-cloud-moon', // В основном ясно
        2: 'fas fa-cloud', // Переменная облачность
        3: 'fas fa-cloud', // Пасмурно
        45: 'fas fa-smog', // Туман
        48: 'fas fa-smog', // Иней
        51: 'fas fa-cloud-rain', // Легкая морось
        53: 'fas fa-cloud-rain', // Морось
        55: 'fas fa-cloud-showers-heavy', // Сильная морось
        56: 'fas fa-cloud-meatball', // Ледяная морось
        57: 'fas fa-cloud-meatball', // Сильная ледяная морось
        61: 'fas fa-cloud-rain', // Небольшой дождь
        63: 'fas fa-cloud-showers-heavy', // Дождь
        65: 'fas fa-cloud-showers-water', // Сильный дождь
        66: 'fas fa-cloud-meatball', // Ледяной дождь
        67: 'fas fa-cloud-meatball', // Сильный ледяной дождь
        71: 'fas fa-snowflake', // Небольшой снег
        73: 'fas fa-snowflake', // Снег
        75: 'fas fa-snowflake', // Сильный снег
        77: 'fas fa-snowflake', // Снежные зерна
        80: 'fas fa-cloud-rain', // Небольшой ливень
        81: 'fas fa-cloud-showers-heavy', // Ливень
        82: 'fas fa-cloud-showers-water', // Сильный ливень
        85: 'fas fa-snowflake', // Небольшой снегопад
        86: 'fas fa-snowflake', // Сильный снегопад
        95: 'fas fa-bolt', // Гроза
        96: 'fas fa-cloud-bolt', // Гроза с небольшим градом
        99: 'fas fa-cloud-bolt' // Гроза с сильным градом
    };

    return iconMap[weatherCode] || 'fas fa-cloud';
}

function startCityTimeUpdate(cityName, timezone) {
    if (state.cityTimers[cityName]) {
        clearInterval(state.cityTimers[cityName]);
    }

    const updateTime = () => {
        const now = new Date();
        let timeString;

        try {
            timeString = now.toLocaleTimeString('ru-RU', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            timeString = now.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        state.cityLocalTimes[cityName] = timeString;

        const cityCard = document.querySelector(`.city-card[data-city="${cityName}"]`);
        if (cityCard) {
            const timeElement = cityCard.querySelector('.city-time');
            if (timeElement) {
                timeElement.textContent = timeString;
            }
        }

        if (state.cities[state.currentCityIndex] === cityName) {
            elements.currentTime.textContent = timeString;
        }
    };

   
    updateTime();

    state.cityTimers[cityName] = setInterval(updateTime, 60000);
}

function updateBackground(weatherData) {
    const body = document.body;

    body.classList.remove('day', 'night', 'rain');

    const isDay = weatherData.current.is_day === 1;

    const conditionCode = weatherData.current.condition.code;
    const isRain = (conditionCode >= 51 && conditionCode <= 67) || (conditionCode >= 80 && conditionCode <= 82);
    const isThunderstorm = conditionCode >= 95;
    const isSnow = conditionCode >= 71 && conditionCode <= 77;

    if (isRain || isThunderstorm || isSnow) {
        body.classList.add('rain');
    } else if (isDay) {
        body.classList.add('day');
    } else {
        body.classList.add('night');
    }
}

function refreshWeather() {
    if (state.cities.length === 0) return;

    const currentCity = state.cities[state.currentCityIndex];
    loadWeatherForCity(currentCity);
}

function displayWeatherData(data) {
    const current = data.current;
    const location = data.location;

    elements.currentCity.textContent = location.name;

    const cityName = location.name;
    if (state.cityLocalTimes[cityName]) {
        elements.currentTime.textContent = state.cityLocalTimes[cityName];
    }

    elements.currentTemp.textContent = Math.round(current.temp_c);

    elements.weatherIcon.className = getWeatherIconClass(current.condition.code, current.is_day);
    elements.weatherDescription.textContent = current.condition.text;

    elements.windSpeed.textContent = `${current.wind_kph} км/ч`;
    elements.humidity.textContent = `${current.humidity}%`;
    elements.pressure.textContent = `${current.pressure_mb} гПа`;
    elements.feelsLike.textContent = `${Math.round(current.feelslike_c)}°C`;

    displayForecast(data.forecast.forecastday);
}

function displayForecast(forecastDays) {
    elements.forecastContainer.innerHTML = '';

    forecastDays.forEach(day => {
        const date = new Date(day.date);
        const dayElement = document.createElement('div');
        dayElement.className = 'forecast-day';

        const isDay = 1;

        dayElement.innerHTML = `
            <div class="forecast-date">${formatForecastDate(date)}</div>
            <div class="forecast-icon">
                <i class="${getWeatherIconClass(day.day.condition.code, isDay)}"></i>
            </div>
            <div class="forecast-temp">
                <span>${day.day.maxtemp_c}°</span>
                <span style="color: var(--text-light)">${day.day.mintemp_c}°</span>
            </div>
            <div class="forecast-desc">${day.day.condition.text}</div>
        `;

        elements.forecastContainer.appendChild(dayElement);
    });
}

function updateCitiesSidebar() {
    elements.citiesSidebar.innerHTML = '';

    state.cities.forEach((cityName, index) => {
        const weatherData = state.weatherData[cityName];
        const isActive = index === state.currentCityIndex;
        const isCurrentLocation = cityName === "Текущее местоположение" && index === 0;

        const cityCard = document.createElement('div');
        cityCard.className = `city-card ${isActive ? 'active' : ''} ${isCurrentLocation ? 'current-location' : ''}`;
        cityCard.setAttribute('data-city', cityName);

        const temp = weatherData ? Math.round(weatherData.current.temp_c) : '--';
        const condition = weatherData ? weatherData.current.condition.text : '--';
        const conditionCode = weatherData ? weatherData.current.condition.code : 0;
        const isDay = weatherData ? weatherData.current.is_day : 1;
        const localTime = state.cityLocalTimes[cityName] || '--:--';

        cityCard.innerHTML = `
            <div class="city-card-header">
                <div class="city-name">${cityName}</div>
                <div class="city-temp">${temp}°</div>
            </div>
            <div class="city-time">
                <i class="fas fa-clock"></i> ${localTime}
            </div>
            <div class="city-weather">
                <div class="city-weather-info">
                    <div class="city-weather-icon">
                        <i class="${getWeatherIconClass(conditionCode, isDay)}"></i>
                    </div>
                    <div class="city-weather-desc">${condition}</div>
                </div>
                ${!isCurrentLocation ? '<button class="remove-city-btn"><i class="fas fa-trash"></i> Удалить</button>' : ''}
            </div>
        `;

        cityCard.addEventListener('click', (e) => {
            if (e.target.closest('.remove-city-btn')) {
                e.stopPropagation();
                e.preventDefault();
                removeCity(index);
                return;
            }

            if (!isActive) {
                state.currentCityIndex = index;
                saveState();
                updateCitiesSidebar();
                loadWeatherForCity(cityName);

                if (window.innerWidth <= 992) {
                    closeMobileMenu();
                }
            }
        });

        elements.citiesSidebar.appendChild(cityCard);
    });
}

function removeCity(index) {
    if (index === 0 && state.cities[index] === "Текущее местоположение") {
       
        return;
    }

    const cityName = state.cities[index];

    state.cities.splice(index, 1);

    if (state.currentCityIndex >= index && state.currentCityIndex > 0) {
        state.currentCityIndex--;
    }

    delete state.weatherData[cityName];
    delete state.cityCoords[cityName];
    delete state.cityTimezones[cityName];
    delete state.cityLocalTimes[cityName];

    if (state.cityTimers[cityName]) {
        clearInterval(state.cityTimers[cityName]);
        delete state.cityTimers[cityName];
    }

    localStorage.removeItem(`weatherCacheTime_${cityName}`);

    saveState();

    updateCitiesSidebar();

    if (state.cities.length > 0) {
        loadWeatherForCity(state.cities[state.currentCityIndex]);
    } else {
        showAddCityModal();
    }
}

function showAddCityModal() {
    elements.addCityModal.classList.remove('hidden');
    elements.cityInput.value = '';
    elements.cityError.classList.add('hidden');
    elements.citySuggestions.classList.add('hidden');
    elements.cityInput.focus();
}

function hideAddCityModal() {
    elements.addCityModal.classList.add('hidden');
}

async function handleCityInput() {
    const query = elements.cityInput.value.trim();

    if (query.length < 2) {
        elements.citySuggestions.classList.add('hidden');
        return;
    }

    try {
        const response = await fetch(
            `${GEOCODE_API}?name=${query}&language=ru&count=10`
        );

        if (!response.ok) {
            const filteredCities = DEFAULT_CITIES.filter(city =>
                city.toLowerCase().includes(query.toLowerCase())
            );
            displayCitySuggestions(filteredCities);
            return;
        }

        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const cities = [...new Set(data.results.map(city => city.name))];
            displayCitySuggestions(cities.slice(0, 8)); 
        } else {
            const filteredCities = DEFAULT_CITIES.filter(city =>
                city.toLowerCase().includes(query.toLowerCase())
            );
            displayCitySuggestions(filteredCities);
        }
    } catch (error) {
        console.error('Ошибка при поиске городов:', error);
        const filteredCities = DEFAULT_CITIES.filter(city =>
            city.toLowerCase().includes(query.toLowerCase())
        );
        displayCitySuggestions(filteredCities);
    }
}

function displayCitySuggestions(cities) {
    elements.citySuggestions.innerHTML = '';

    cities.forEach(city => {
        const suggestion = document.createElement('div');
        suggestion.className = 'suggestion-item';
        suggestion.textContent = city;

        suggestion.addEventListener('click', () => {
            elements.cityInput.value = city;
            elements.citySuggestions.classList.add('hidden');
        });

        elements.citySuggestions.appendChild(suggestion);
    });

    elements.citySuggestions.classList.remove('hidden');
}

function showCityError(message) {
    elements.cityError.textContent = message;
    elements.cityError.classList.remove('hidden');
}

async function saveCity() {
    const cityName = elements.cityInput.value.trim();

    if (!cityName) {
        showCityError('Введите название города');
        return;
    }

    if (state.cities.includes(cityName)) {
        showCityError('Этот город уже добавлен');
        return;
    }

    try {
        const response = await fetch(
            `${GEOCODE_API}?name=${cityName}&language=ru&count=1`
        );

        if (!response.ok) {
            throw new Error('Ошибка при проверке города');
        }

        const data = await response.json();

        if (!data || !data.results || data.results.length === 0) {
            throw new Error('Город не найден. Проверьте правильность написания.');
        }

        hideAddCityModal();

        state.cities.push(cityName);
        state.currentCityIndex = state.cities.length - 1;
        saveState();

        loadWeatherForCity(cityName);

    } catch (error) {
        console.error('Ошибка при проверке города:', error);
        showCityError(error.message);
    }
}

function formatForecastDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const dateToCheck = new Date(date);
    dateToCheck.setHours(0, 0, 0, 0);

    if (dateToCheck.getTime() === today.getTime()) return 'Сегодня';
    if (dateToCheck.getTime() === tomorrow.getTime()) return 'Завтра';

    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    return date.toLocaleDateString('ru-RU', options);
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function showLoading() {
    elements.loadingState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
    elements.mainContent.classList.add('hidden');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.remove('hidden');
    elements.mainContent.classList.add('hidden');
}

function showMainContent() {
    elements.loadingState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
}

function adjustForScreenHeight() {
    if (window.innerWidth <= 768) {
        const weatherContainer = document.querySelector('.weather-container');
        const forecastSection = document.querySelector('.forecast-section');
        const mainContent = document.getElementById('mainContent');

        if (weatherContainer && forecastSection && mainContent) {
            const containerHeight = weatherContainer.offsetHeight;
            const windowHeight = window.innerHeight;
            const headerHeight = document.querySelector('.header').offsetHeight;

            if (containerHeight > (windowHeight - headerHeight - 40)) {
               
                weatherContainer.style.padding = '15px 12px';
                forecastSection.style.paddingTop = '15px';
                forecastSection.style.marginTop = '15px';

                const forecastDays = document.querySelectorAll('.forecast-day');
                forecastDays.forEach(day => {
                    day.style.padding = '10px 8px';
                });

                const tempValue = document.querySelector('.temp-value');
                if (tempValue) {
                    tempValue.style.fontSize = '2.8rem';
                }

                const forecastTempSpans = document.querySelectorAll('.forecast-temp span');
                forecastTempSpans.forEach(span => {
                    span.style.fontSize = '1rem';
                });
            }
        }
    }
}

window.addEventListener('resize', adjustForScreenHeight);
window.addEventListener('load', adjustForScreenHeight);

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('resize', checkScreenWidth);
window.addEventListener('load', checkScreenWidth);