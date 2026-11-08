(function(){
  'use strict';
  const storageKey = 'linkbook-language';
  const languages = { en: 'English', fr: 'Français', mfe: 'Kreol Morisien' };
  const translations = {
    fr: { 'Home feed':'Fil d’actualité','Friends':'Amis','Messages':'Messages','Saved posts':'Publications enregistrées','My profile':'Mon profil','Settings':'Paramètres','Home':'Accueil','Chats':'Messages','Saved':'Enregistrés','Profile':'Profil','Your feed':'Votre fil','Latest':'Récents','Popular':'Populaires','Create post':'Créer une publication','Publish post':'Publier','Share a thought':'Partager une idée','Share a moment or update...':'Partagez un moment ou une nouvelle...','Like':'J’aime','Liked':'Aimé','Comment':'Commenter','Share':'Partager','likes':'J’aime','comments':'commentaires','Public':'Public','Save post':'Enregistrer la publication','Write a comment':'Écrire un commentaire','Send':'Envoyer','People you may know':'Personnes que vous connaissez peut-être','Suggested friend':'Ami suggéré','Connected':'Connecté','Add friend':'Ajouter','Remove':'Retirer','No matching friends.':'Aucun ami correspondant.','Profile settings':'Paramètres du profil','Display name':'Nom affiché','Bio':'Biographie','Location':'Lieu','Save changes':'Enregistrer les modifications','Edit profile':'Modifier le profil','Your posts':'Vos publications','Demo data':'Données de démonstration','Reset local demo':'Réinitialiser la démo','Language':'Langue','Country':'Pays','Time zone':'Fuseau horaire','Mauritius':'Maurice','Mauritius time':'Heure de Maurice','Regional settings':'Paramètres régionaux','Post times are displayed in Mauritius time (UTC+04:00).':'Les heures des publications sont affichées à l’heure de Maurice (UTC+04:00).','No posts yet. Create a post to get started! ✨':'Aucune publication. Créez-en une ! ✨','Post saved in this browser only.':'Publication enregistrée uniquement dans ce navigateur.','Account details':'Informations du profil','Your post will appear in this demo feed.':'Votre publication apparaîtra dans ce fil de démonstration.','My profile':'Mon profil','Search posts and friends':'Rechercher des publications et des amis','Your Profile':'Votre profil' },
    mfe: { 'Home feed':'Fil lakaz','Friends':'Bann kamarad','Messages':'Mesaz','Saved posts':'Bann post anrezistre','My profile':'Mo profil','Settings':'Paramet','Home':'Lakaz','Chats':'Mesaz','Saved':'Anrezistre','Profile':'Profil','Your feed':'To fil','Latest':'Dernie','Popular':'Popiler','Create post':'Kre enn post','Publish post':'Pibliye','Share a thought':'Partaz enn lide','Share a moment or update...':'Partaz enn moman ouswa enn nouvel...','Like':'Kontan','Liked':'Mo kontan','Comment':'Komante','Share':'Partaze','likes':'kontan','comments':'komanter','Public':'Piblik','Save post':'Anrezistre post','Write a comment':'Ekrir enn komanter','Send':'Avoye','People you may know':'Bann dimounn ki to kapav kone','Suggested friend':'Kamarad propoz','Connected':'Konekte','Add friend':'Azout kamarad','Remove':'Retire','No matching friends.':'Pena kamarad ki koresponn.','Profile settings':'Paramet profil','Display name':'Nom afise','Bio':'Bio','Location':'Landrwa','Save changes':'Anrezistre sanzman','Edit profile':'Sanz mo profil','Your posts':'To bann post','Demo data':'Done demonstrasion','Reset local demo':'Rekoumans demo','Language':'Lang','Country':'Pei','Time zone':'Zonn ler','Mauritius':'Moris','Mauritius time':'Ler Moris','Regional settings':'Paramet Moris','Post times are displayed in Mauritius time (UTC+04:00).':'Ler bann post afise dapre ler Moris (UTC+04:00).','No posts yet. Create a post to get started! ✨':'Pankor ena post. Kre enn post ! ✨','Post saved in this browser only.':'Post-la anrezistre zis dan sa browser-la.','Account details':'Detay profil','Your post will appear in this demo feed.':'To post pou paret dan sa fil demonstrasion-la.','Search posts and friends':'Rod bann post ek kamarad','Your Profile':'To profil' }
  };
  function getLanguage(){ const saved = localStorage.getItem(storageKey); return Object.hasOwn(languages,saved) ? saved : 'en'; }
  function t(key){ const lang = getLanguage(); return (translations[lang] && translations[lang][key]) || key; }
  function formatDateTime(date){
    const lang=getLanguage(), locale=lang==='fr'?'fr-FR':'en-GB';
    return new Intl.DateTimeFormat(locale,{timeZone:'Indian/Mauritius',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(date));
  }
  function applyStatic(){
    document.documentElement.lang=getLanguage()==='mfe'?'mfe-MU':getLanguage()==='fr'?'fr':'en';
    const labels={feed:'Home feed',friends:'Friends',messages:'Messages',saved:'Saved posts',profile:'My profile',settings:'Settings'};
    document.querySelectorAll('#nav button[data-page]').forEach(btn=>{const s=btn.querySelector('span');if(s)s.textContent=t(labels[btn.dataset.page]||btn.dataset.page);});
    const mobile={feed:'Home',friends:'Friends',messages:'Chats',saved:'Saved',profile:'Profile'};
    document.querySelectorAll('.mobile-nav button[data-page]').forEach(btn=>{const s=btn.querySelector('small');if(s)s.textContent=t(mobile[btn.dataset.page]||btn.dataset.page);});
    const search=document.getElementById('search');if(search){search.placeholder=t('Search posts and friends');search.setAttribute('aria-label',t('Search posts and friends'));}
    const nick=document.querySelector('.profile-nav small');if(nick)nick.textContent=t('My profile');
    const region=document.getElementById('linkbookCountryBadge');if(region)region.textContent='🇲🇺 '+t('Mauritius');
    refreshClock();
  }
  function refreshClock(){
    document.querySelectorAll('[data-mu-clock]').forEach(el=>{el.textContent=formatDateTime(Date.now())+' MUT';});
  }
  function setLanguage(lang){if(!Object.hasOwn(languages,lang))return;localStorage.setItem(storageKey,lang);applyStatic();}
  window.LinkBookRegion=Object.freeze({country:'Mauritius',countryCode:'MU',timeZone:'Indian/Mauritius',languages,getLanguage,setLanguage,t,formatDateTime,applyStatic});
  document.addEventListener('DOMContentLoaded',applyStatic);
  setInterval(refreshClock,30000);
})();
