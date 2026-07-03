// --- 1. CONFIGURATION & DONNÉES LOCALES ---
const START_DATE = new Date('2026-05-09T01:00:00'); 
const SECRET_PIN = "0000";
const NASA_API_KEY = "DEMO_KEY"; 

let posts = [];
let nasaCache = JSON.parse(localStorage.getItem('nasa_cache')) || {};
let selectedCoords = null; 
let isPickingLocation = false;
let isNasaLoaded = false; 
let editingId = null; // Mémoire pour savoir quel souvenir on est en train de modifier !

// --- CHARGEMENT HYBRIDE ---
async function loadInitialData() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        if (response.ok) {
            const texte = await response.text(); 
            if (texte && texte.trim() !== "") {
                posts = JSON.parse(texte);
                console.log("✅ Données synchronisées chargées depuis data.json !");
            } else {
                posts = JSON.parse(localStorage.getItem('notre_histoire_posts')) || [];
            }
        } else {
            throw new Error("Fichier data.json non trouvé");
        }
    } catch (e) {
        posts = JSON.parse(localStorage.getItem('notre_histoire_posts')) || [];
    }
    
    updateAdaptiveCounters();
    renderCalendar();
    saveAndRenderAll(false);
    refreshScrollObserver();
}

// --- 2. EXPORT & IMPORT DE SAUVEGARDE ---
window.exportData = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(posts, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "data.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    alert("Glisse et remplace ce fichier 'data.json' dans le dossier de ton projet sur PC pour synchroniser Ngrok !");
};

document.getElementById('import-file').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            posts = JSON.parse(event.target.result);
            saveAndRenderAll(true);
            alert("Sauvegarde importée avec succès !");
            document.getElementById('pin-modal').classList.remove('active');
        } catch(err) { alert("Fichier invalide."); }
    };
    reader.readAsText(file);
});

// --- 3. GESTION DES ONGLETS ---
window.openTab = function(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    if (btnElement) btnElement.classList.add('active');

    refreshScrollObserver();

    if (tabId === 'tab-carte') {
        setTimeout(() => map.invalidateSize(true), 150);
        setTimeout(() => map.invalidateSize(true), 400);
    }
    
    if (tabId === 'tab-nasa' && !isNasaLoaded) {
        renderNasaFeed();
        isNasaLoaded = true;
    }
};

// --- 4. GENERATEUR AUTOMATIQUE DES MOIS ---
function generateMilestones() {
    let milestones = [];
    milestones.push({ title: "Notre rencontre ❤️", date: new Date(START_DATE) });
    for (let i = 1; i <= 1200; i++) { 
        let d = new Date(START_DATE);
        d.setMonth(START_DATE.getMonth() + i);
        let title = (i % 12 === 0) ? `Anniversaire : ${i / 12} An(s) 🥂` : `${i} Mois ensemble ✨`;
        milestones.push({ title: title, date: d });
    }
    return milestones;
}
const allMilestones = generateMilestones();

// --- 5. ANIMATIONS AU SCROLL ---
const observerOptions = { threshold: 0.1, rootMargin: "0px 0px -20px 0px" };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { 
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            if(entry.target.classList.contains('staggered-container')) {
                const items = entry.target.querySelectorAll('.stagger-item');
                items.forEach((item, index) => {
                    setTimeout(() => item.classList.add('active'), index * 80); 
                });
            }
        } 
    });
}, observerOptions);

function refreshScrollObserver() {
    document.querySelectorAll('.tab-content.active .reveal-blur, .tab-content.active .reveal-scale, .tab-content.active .reveal-fade, .tab-content.active .stagger-item, .tab-content.active .staggered-container').forEach(el => {
        el.classList.remove('active');
        observer.observe(el);
    });
}

// --- 6. COMPTEUR PRINCIPAL ---
function updateMainCounter() {
    const diff = new Date() - START_DATE;
    document.getElementById('c-days').textContent = String(Math.floor(diff / 864e5)).padStart(2, '0');
    document.getElementById('c-hours').textContent = String(Math.floor((diff % 864e5) / 36e5)).padStart(2, '0');
    document.getElementById('c-mins').textContent = String(Math.floor((diff % 36e5) / 6e4)).padStart(2, '0');
    document.getElementById('c-secs').textContent = String(Math.floor((diff % 6e4) / 1000)).padStart(2, '0');
}
setInterval(updateMainCounter, 1000);
updateMainCounter();

// --- 7. COMPTEURS ADAPTATIFS ---
function updateAdaptiveCounters() {
    const now = new Date();
    let past = [], future = [];

    allMilestones.forEach(m => {
        if (m.date <= now) past.push(m);
        else future.push(m);
    });

    const lastTwoPast = past.slice(-2);
    const firstTwoFuture = future.slice(0, 2);

    const pastContainer = document.getElementById('past-counters');
    pastContainer.innerHTML = '';
    lastTwoPast.forEach(m => {
        const diffDays = Math.floor((now - m.date) / 864e5);
        pastContainer.innerHTML += `<div class="adaptive-card stagger-item"><h4>${m.title}</h4><span class="time-diff">Il y a ${diffDays}j</span></div>`;
    });

    const futureContainer = document.getElementById('future-counters');
    futureContainer.innerHTML = '';
    firstTwoFuture.forEach(m => {
        const diffDays = Math.ceil((m.date - now) / 864e5);
        futureContainer.innerHTML += `<div class="adaptive-card future stagger-item"><h4>${m.title}</h4><span class="time-diff">Dans ${diffDays}j</span></div>`;
    });
}

// --- 8. MOTEUR DU CALENDRIER ---
let currentCalDate = new Date(); 

function renderCalendar() {
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    
    document.getElementById('cal-month-title').textContent = new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; 
    const totalDays = new Date(year, month + 1, 0).getDate();

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    for (let i = 0; i < firstDayIndex; i++) grid.innerHTML += `<div class="cal-day empty"></div>`;

    for (let day = 1; day <= totalDays; day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let hasEvent = false; let eventText = "";

        posts.forEach(p => {
            if (p.date === dateString) {
                hasEvent = true;
                eventText += `<b>📝 ${p.title}</b> (${p.location})<br>`;
            }
        });

        allMilestones.forEach(m => {
            const mStr = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, '0')}-${String(m.date.getDate()).padStart(2, '0')}`;
            if (mStr === dateString) {
                hasEvent = true;
                eventText += `<br>🎉 <b>Étape :</b> ${m.title}`;
            }
        });

        const dayEl = document.createElement('div');
        dayEl.className = `cal-day ${hasEvent ? 'has-event' : ''}`;
        dayEl.textContent = day;
        dayEl.onclick = () => {
            const detailsBox = document.getElementById('calendar-details');
            detailsBox.style.opacity = 0;
            setTimeout(() => {
                detailsBox.innerHTML = hasEvent ? eventText : `Aucun événement le ${day}/${month+1}/${year}.`;
                detailsBox.style.opacity = 1;
            }, 150);
        };
        grid.appendChild(dayEl);
    }
}

function animateCalendarChange(direction) {
    const grid = document.getElementById('calendar-grid');
    grid.style.transform = direction === 'next' ? 'translateX(-30px)' : 'translateX(30px)';
    grid.style.opacity = '0';

    setTimeout(() => {
        if (direction === 'next') currentCalDate.setMonth(currentCalDate.getMonth() + 1);
        else currentCalDate.setMonth(currentCalDate.getMonth() - 1);
        
        renderCalendar();
        grid.style.transform = direction === 'next' ? 'translateX(30px)' : 'translateX(-30px)';
        
        setTimeout(() => {
            grid.style.transform = 'translateX(0px)';
            grid.style.opacity = '1';
        }, 50);
    }, 200);
}

document.getElementById('cal-prev').onclick = () => animateCalendarChange('prev');
document.getElementById('cal-next').onclick = () => animateCalendarChange('next');

// --- 9. CARTE & INTERACTIVITÉ ---
const map = L.map('map').setView([48.6333, 7.4333], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
let polyline = L.polyline([], {color: '#d4af37', weight: 4, opacity: 0.9, dashArray: '6, 12'}).addTo(map);
let tempMarker = null;

const btnPickMap = document.getElementById('btn-pick-map');
const pickerToast = document.getElementById('map-picker-toast');
const cancelPickBtn = document.getElementById('cancel-pick-btn');
const modal = document.getElementById('add-post-modal');

btnPickMap.addEventListener('click', () => {
    modal.classList.remove('active'); 
    pickerToast.classList.add('active'); 
    isPickingLocation = true;
    
    const carteBtn = document.querySelector('.main-menu button:nth-child(4)');
    openTab('tab-carte', carteBtn);
});

cancelPickBtn.addEventListener('click', () => {
    isPickingLocation = false;
    pickerToast.classList.remove('active');
    modal.classList.add('active');
});

map.on('click', async function(e) {
    if (!isPickingLocation) return; 
    
    isPickingLocation = false;
    pickerToast.classList.remove('active'); 
    modal.classList.add('active');

    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    selectedCoords = [lat, lon];

    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker(selectedCoords).addTo(map).bindPopup("Lieu choisi ✦").openPopup();

    const locInput = document.getElementById('input-location');
    locInput.value = "Recherche...";

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await response.json();
        locInput.value = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.name || "Lieu personnalisé";
    } catch (err) { locInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
});

function updateMap() {
    map.eachLayer((layer) => { if (!!layer.toGeoJSON) map.removeLayer(layer); });
    if (tempMarker) tempMarker = null; 
    
    polyline = L.polyline([], {color: '#d4af37', weight: 4, opacity: 0.9, dashArray: '6, 12'}).addTo(map);
    const sortedPosts = [...posts].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    sortedPosts.forEach(p => {
        if (p.coords) {
            L.marker(p.coords).addTo(map).bindPopup(`<b>${p.title}</b><br>${p.location}`);
            polyline.addLatLng(p.coords);
        }
    });

    if (sortedPosts.length > 0 && sortedPosts[sortedPosts.length-1].coords) {
        map.setView(sortedPosts[sortedPosts.length-1].coords, 6);
    }
}

// --- 10. STATS ---
function updateStats() {
    document.getElementById('stat-moments').textContent = posts.length;
    const uniqueCities = new Set(posts.map(p => p.location.trim().toLowerCase()));
    document.getElementById('stat-cities').textContent = uniqueCities.size;
}

// --- 11. RENDU DU JOURNAL AVEC GALERIE TACTILE ET ÉDITION ---
window.switchPOV = function(btn, type) {
    const card = btn.closest('.glass-card');
    card.querySelectorAll('.pov-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    card.querySelector('.desc-lui').classList.remove('desc-active');
    card.querySelector('.desc-elle').classList.remove('desc-active');
    card.querySelector(`.desc-${type}`).classList.add('desc-active');
};

function renderFeed() {
    const feed = document.getElementById('feed');
    feed.innerHTML = '';
    const now = new Date();

    feed.classList.add('staggered-container'); 

    posts.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(post => {
        const isLocked = post.lockDate && new Date(post.lockDate) > now;
        const card = document.createElement('article');
        card.className = `glass-card glass stagger-item`; 
        
        let lockHTML = ''; let contentClass = '';
        if(isLocked) {
            const unlockDate = new Date(post.lockDate).toLocaleDateString('fr-FR');
            lockHTML = `<div class="lock-overlay"><span>🔒</span><p>Déverrouillage le ${unlockDate}</p></div>`;
            contentClass = 'locked-card';
        }
        const dateStr = new Date(post.date).toLocaleDateString('fr-FR');
        
        // Rétrocompatibilité : transforme une image seule en tableau si besoin
        let imagesArray = [];
        if (Array.isArray(post.imgData)) {
            imagesArray = post.imgData;
        } else if (post.imgData) {
            imagesArray = [post.imgData];
        } else {
            imagesArray = ['https://images.unsplash.com/photo-1518199266791-5375a83190b7?q=80&w=800'];
        }

       // Génération de la galerie (Photos + Vidéos swipeables sur mobile)
        let galleryHTML = `<div class="card-gallery">`;
        imagesArray.forEach(mediaUrl => {
            // Détection : Si le fichier commence par "data:video" ou finit par ".mp4" / ".mov"
            if (mediaUrl.startsWith('data:video') || mediaUrl.match(/\.(mp4|mov|webm)$/i)) {
                galleryHTML += `
                    <video controls class="card-image" style="object-fit: cover; background: #000;">
                        <source src="${mediaUrl}">
                        Ton navigateur ne supporte pas cette vidéo.
                    </video>`;
            } else {
                galleryHTML += `<div class="card-image" style="background-image: url('${mediaUrl}');"></div>`;
            }
        });
        galleryHTML += `</div>`;
        
        card.innerHTML = `
            ${lockHTML}
            <div class="${contentClass}">
                <div class="card-top"><span>📍 ${post.location}</span><span>${dateStr}</span></div>
                <h3>${post.title}</h3>
                ${galleryHTML}
                <div class="pov-toggle">
                    <button class="pov-btn active" onclick="switchPOV(this, 'lui')">Lui</button>
                    ${post.descElle ? `<button class="pov-btn" onclick="switchPOV(this, 'elle')">Elle</button>` : ''}
                </div>
                <div style="max-height: 120px; overflow-y: auto; padding-right: 5px;">
                    <p class="desc-lui desc-active">${post.descLui}</p>
                    ${post.descElle ? `<p class="desc-elle">${post.descElle}</p>` : ''}
                </div>
                ${post.music ? `<br><a href="${post.music}" target="_blank" style="color:var(--gold); text-decoration:none; font-size:0.8rem; font-weight:500;">🎵 Lire le média</a>` : ''}
            </div>
            <div class="admin-controls">
                <button onclick="editPost(${post.id})" class="btn-admin btn-edit" title="Modifier">✏️</button>
                <button onclick="deletePost(${post.id})" class="btn-admin btn-delete" title="Supprimer">✕</button>
            </div>
        `;
        feed.appendChild(card);
    });
}

// FONCTION POUR MODIFIER UN SOUVENIR
window.editPost = function(id) {
    const p = posts.find(item => item.id === id);
    if (!p) return;

    editingId = id; // Mémorise l'ID qu'on modifie
    selectedCoords = p.coords || null;

    // Pré-remplit tous les champs du formulaire
    document.getElementById('input-title').value = p.title || '';
    document.getElementById('input-location').value = p.location || '';
    document.getElementById('input-date').value = p.date || '';
    document.getElementById('input-desc-lui').value = p.descLui || '';
    document.getElementById('input-desc-elle').value = p.descElle || '';
    document.getElementById('input-music').value = p.music || '';
    document.getElementById('input-lock-date').value = p.lockDate || '';

    // Modifie le titre de la fenêtre pour indiquer qu'on est en mode édition
    document.getElementById('modal-title').textContent = "Modifier le Souvenir";
    document.getElementById('publish-btn').textContent = "Enregistrer les modifications ↗";

    // Ouvre le menu
    document.getElementById('add-post-modal').classList.add('active');
};

window.deletePost = function(id) {
    if(confirm("Veux-tu vraiment supprimer ce souvenir ?")) {
        posts = posts.filter(p => p.id !== id);
        saveAndRenderAll(true);
    }
};

function saveAndRenderAll(saveToLocal = true) {
    if (saveToLocal) {
        localStorage.setItem('notre_histoire_posts', JSON.stringify(posts));
    }
    renderFeed();
    updateStats();
    updateMap();
    renderCalendar();
}

// --- 12. PUBLICATION / MODIFICATION AVEC MULTI-PHOTOS ---
const form = document.getElementById('post-form');
const publishBtn = document.getElementById('publish-btn');

document.getElementById('open-modal-btn').onclick = () => { 
    editingId = null; // Réinitialise l'édition
    form.reset(); 
    selectedCoords = null; 
    if (tempMarker) map.removeLayer(tempMarker);
    
    document.getElementById('modal-title').textContent = "Nouveau Souvenir";
    publishBtn.textContent = "Publier notre souvenir ↗";
    document.getElementById('add-post-modal').classList.add('active');
};

document.getElementById('close-modal').onclick = () => { 
    if (tempMarker) map.removeLayer(tempMarker); 
    document.getElementById('add-post-modal').classList.remove('active');
    document.getElementById('map-picker-toast').classList.remove('active');
    isPickingLocation = false;
    editingId = null;
};

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error);
});

publishBtn.addEventListener('click', async () => {
    const title = document.getElementById('input-title').value;
    const location = document.getElementById('input-location').value;
    const date = document.getElementById('input-date').value;
    const descLui = document.getElementById('input-desc-lui').value;
    const descElle = document.getElementById('input-desc-elle').value;
    const lockDate = document.getElementById('input-lock-date').value;
    const music = document.getElementById('input-music').value;
    const files = document.getElementById('input-photos').files;

    if (!title || !date || !location || !descLui) return alert("Remplis les champs principaux.");

    publishBtn.textContent = "Traitement en cours...";
    
    // Conversion des multiples photos en Base64
    let newImgDataArray = [];
    if (files && files.length > 0) {
        newImgDataArray = await Promise.all(Array.from(files).map(toBase64));
    }

    let finalCoords = selectedCoords;
    if (!finalCoords) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`);
            const data = await response.json();
            if (data && data.length > 0) finalCoords = [data[0].lat, data[0].lon];
        } catch (e) {}
    }

    // Si on est en train de modifier un souvenir existant
    if (editingId) {
        const postIndex = posts.findIndex(p => p.id === editingId);
        if (postIndex !== -1) {
            posts[postIndex].title = title;
            posts[postIndex].location = location;
            posts[postIndex].date = date;
            posts[postIndex].descLui = descLui;
            posts[postIndex].descElle = descElle;
            posts[postIndex].lockDate = lockDate;
            posts[postIndex].music = music;
            posts[postIndex].coords = finalCoords;

            // Ne remplace les photos que si l'utilisateur en a sélectionné de nouvelles
            if (newImgDataArray.length > 0) {
                posts[postIndex].imgData = newImgDataArray;
            }
        }
        editingId = null;
    } else {
        // Sinon, on crée un nouveau souvenir
        const newPost = { 
            id: Date.now(), title, location, date, descLui, descElle, lockDate, music, 
            imgData: newImgDataArray.length > 0 ? newImgDataArray : "", 
            coords: finalCoords 
        };
        posts.push(newPost);
    }
    
    saveAndRenderAll(true);
    
    const journalBtn = document.querySelector('.main-menu button:nth-child(2)');
    openTab('tab-journal', journalBtn);
    
    document.getElementById('add-post-modal').classList.remove('active');
    publishBtn.textContent = "Publier notre souvenir ↗";
});

// --- 13. MODE ADMIN ---
const pinModal = document.getElementById('pin-modal');
const adminBtn = document.getElementById('admin-btn');
const pinInput = document.getElementById('pin-input');

adminBtn.onclick = () => {
    if(document.body.classList.contains('edit-mode')) {
        document.body.classList.remove('edit-mode');
        adminBtn.textContent = '🔒';
    } else {
        pinModal.classList.add('active');
        pinInput.value = ''; pinInput.focus();
    }
};
document.getElementById('close-pin-modal-btn').onclick = () => { pinModal.classList.remove('active'); };
document.getElementById('validate-pin-btn').onclick = () => {
    if (pinInput.value === SECRET_PIN) {
        document.body.classList.add('edit-mode');
        adminBtn.textContent = '🔓';
        pinModal.classList.remove('active');
    } else {
        alert("Code incorrect."); pinInput.value = '';
    }
};

// --- 14. MOTEUR NASA APOD ---
async function fetchNasaApod(dateStr) {
    if (nasaCache[dateStr]) return nasaCache[dateStr];
    try {
        const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&date=${dateStr}`);
        if (!res.ok) throw new Error('Erreur API NASA');
        const data = await res.json();
        nasaCache[dateStr] = data;
        localStorage.setItem('nasa_cache', JSON.stringify(nasaCache));
        return data;
    } catch (e) { return null; }
}

function createNasaCard(apod, originalDateStr = null) {
    const article = document.createElement('article');
    article.className = 'glass-card glass stagger-item active';
    
    let mediaHtml = '';
    if (apod.media_type === 'video') {
        mediaHtml = `<iframe width="100%" height="260" src="${apod.url}" frameborder="0" style="border-radius:12px; margin-bottom:20px;"></iframe>`;
    } else {
        mediaHtml = `<div class="card-image" style="background-image: url('${apod.url}');"></div>`;
    }

    let eventBadge = '';
    if (originalDateStr) {
        const matchingPost = posts.find(p => p.date === originalDateStr);
        if (matchingPost) {
            eventBadge = `📍 <b>Souvenir :</b> ${matchingPost.title}`;
        } else {
            const mStr = new Date(originalDateStr).toISOString().split('T')[0];
            const matchingMilestone = allMilestones.find(m => {
                const milStr = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, '0')}-${String(m.date.getDate()).padStart(2, '0')}`;
                return milStr === mStr;
            });
            if (matchingMilestone) eventBadge = `🎉 <b>Étape :</b> ${matchingMilestone.title}`;
        }
    }

    const frDate = new Date(apod.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    article.innerHTML = `
        <div class="card-top"><span>🔭 NASA APOD</span><span style="color:var(--gold);">${frDate}</span></div>
        <h3 style="font-size:1.4rem; margin-bottom:10px;">${apod.title}</h3>
        ${mediaHtml}
        ${eventBadge ? `<p style="color:var(--gold); font-size:0.85rem; margin-bottom:15px; padding:8px; background:rgba(212,175,55,0.1); border-radius:8px;">${eventBadge}</p>` : ''}
        <div style="max-height: 120px; overflow-y: auto; padding-right: 5px;">
            <p class="desc" style="margin: 0;">${apod.explanation}</p>
        </div>
    `;
    return article;
}

async function renderNasaFeed() {
    const nasaFeed = document.getElementById('nasa-feed');
    nasaFeed.innerHTML = '<p style="text-align:center; width:100%; color:var(--gold);">Connexion aux satellites de la NASA en cours... 🛰️</p>';
    nasaFeed.classList.add('staggered-container');
    
    const now = new Date();
    let importantDates = new Set();
    
    posts.forEach(p => { if(new Date(p.date) <= now) importantDates.add(p.date); });
    
    allMilestones.forEach(m => {
        if(m.date <= now) {
            const dStr = `${m.date.getFullYear()}-${String(m.date.getMonth() + 1).padStart(2, '0')}-${String(m.date.getDate()).padStart(2, '0')}`;
            importantDates.add(dStr);
        }
    });

    const sortedDates = Array.from(importantDates).sort((a,b) => new Date(b) - new Date(a)).slice(0, 10);
    
    nasaFeed.innerHTML = '';
    if (sortedDates.length === 0) {
        nasaFeed.innerHTML = '<p style="text-align:center; width:100%;">Ajoutez un événement passé pour voir le ciel étoilé ce jour-là.</p>';
        return;
    }

    for (let dateStr of sortedDates) {
        const apod = await fetchNasaApod(dateStr);
        if (apod) {
            const card = createNasaCard(apod, dateStr);
            nasaFeed.appendChild(card);
        }
    }
    refreshScrollObserver();
}

document.getElementById('btn-nasa-search').addEventListener('click', async () => {
    const searchDate = document.getElementById('nasa-search-date').value;
    if (!searchDate) return alert("Veuillez sélectionner une date.");
    if (new Date(searchDate) > new Date()) return alert("La NASA n'a pas encore pris de photo dans le futur !");

    const container = document.getElementById('nasa-search-result');
    container.innerHTML = '<p style="color:var(--gold);">Analyse spatiale en cours... 🔭</p>';
    
    const apod = await fetchNasaApod(searchDate);
    if (apod) {
        container.innerHTML = '';
        container.appendChild(createNasaCard(apod, searchDate));
    } else {
        container.innerHTML = '<p style="color:#ff4757;">Impossible de contacter la NASA.</p>';
    }
});

document.getElementById('btn-random-nasa').addEventListener('click', async () => {
    const container = document.getElementById('random-nasa-container');
    container.innerHTML = '<p style="color:var(--gold); text-align:center;">Recherche d\'une merveille spatiale aléatoire... 🚀</p>';
    
    try {
        const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&count=1`);
        const data = await res.json();
        if (data && data.length > 0) {
            container.innerHTML = '';
            container.appendChild(createNasaCard(data[0]));
        }
    } catch(e) {
        container.innerHTML = '<p style="color:#ff4757; text-align:center;">Erreur spatiale de connexion.</p>';
    }
});

// --- CHARGEMENT INITIAL ---
window.onload = () => {
    loadInitialData();
};