document.addEventListener('DOMContentLoaded', () => {
  const yearNode = document.getElementById('year');
  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  const showMissingFields = (missingFields) => {
    const panel = document.getElementById('missingFieldsPanel');
    const list = document.getElementById('missingFieldsList');
    if (!panel || !list) return;

    if (!missingFields.length) {
      panel.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    panel.classList.remove('hidden');
    list.innerHTML = missingFields.map((field) => `<li>${field}</li>`).join('');
  };

  const getBudgetFormMissingFields = (form) => {
    const fields = [
      { key: 'name', label: 'Full Name', value: form.querySelector('[name="name"]')?.value.trim() },
      { key: 'phone', label: 'Mobile Number', value: form.querySelector('[name="phone"]')?.value.trim() },
      { key: 'email', label: 'Email Address', value: form.querySelector('[name="email"]')?.value.trim() },
      { key: 'eventType', label: 'Event Type', value: form.querySelector('[name="eventType"]')?.value },
      { key: 'address', label: 'Event Address', value: form.querySelector('[name="address"]')?.value.trim() },
      { key: 'confirmAddress', label: 'Confirm Address', value: form.querySelector('[name="confirmAddress"]')?.value.trim() },
      { key: 'cateringRequired', label: 'Catering Option', value: form.querySelector('[name="cateringRequired"]')?.value },
      { key: 'guestCount', label: 'Number of Guests', value: form.querySelector('[name="guestCount"]')?.value.trim() },
      { key: 'package', label: 'Package', value: form.querySelector('[name="package"]')?.value },
      { key: 'budget', label: 'Confirmed Budget', value: form.querySelector('[name="budget"]')?.value.trim() }
    ];

    const missing = fields.filter((field) => !field.value).map((field) => field.label);
    const cateringRequired = form.querySelector('[name="cateringRequired"]')?.value;
    if (cateringRequired === 'Yes') {
      const cuisineChecked = form.querySelectorAll('input[name="cuisine"]:checked').length;
      if (cuisineChecked === 0) {
        missing.push('Food menu selection');
      }
    }

    const address = form.querySelector('[name="address"]')?.value.trim();
    const confirmAddress = form.querySelector('[name="confirmAddress"]')?.value.trim();
    if (address && confirmAddress && address.toLowerCase() !== confirmAddress.toLowerCase()) {
      missing.push('Address and Confirm Address must match');
    }

    return [...new Set(missing)];
  };

  const forms = document.querySelectorAll('form');

  forms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('.form-status');
      if (!status) return;

      const formName = form.id || 'form';
      if (formName === 'budgetForm') {
        const missingFields = getBudgetFormMissingFields(form);
        showMissingFields(missingFields);
        if (missingFields.length > 0) {
          status.textContent = 'Please complete the missing details below.';
          status.style.color = '#d35a4f';
          return;
        }

        const normalizeAddress = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const address = normalizeAddress(form.querySelector('[name="address"]')?.value);
        const confirmAddress = normalizeAddress(form.querySelector('[name="confirmAddress"]')?.value);
        if (address !== confirmAddress) {
          status.textContent = 'Address and confirm address must match.';
          status.style.color = '#d35a4f';
          return;
        }

        const finalConfirmationCheck = document.getElementById('finalConfirmationCheck');
        if (finalConfirmationCheck && !finalConfirmationCheck.checked) {
          status.textContent = 'Please confirm the final order details before submitting.';
          status.style.color = '#d35a4f';
          return;
        }
      }
      const submittedFormData = new FormData(form);
      const formData = Object.fromEntries(submittedFormData.entries());
      const cuisineChoices = submittedFormData.getAll('cuisine');
      Object.keys(formData).forEach((key) => {
        if (typeof formData[key] === 'string') {
          formData[key] = formData[key].replace(/\s+/g, ' ').trim();
        }
      });
      if (cuisineChoices.length > 0) formData.cuisine = cuisineChoices;
      if (formName === 'budgetForm' && formData.cateringRequired === 'No') {
        formData.cuisine = [];
        formData.otherFood = '';
      }
      let endpoint = '';
      let successMessage = '';

      const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : (window.location.protocol === 'http:' || window.location.protocol === 'https:' ? window.location.origin : 'http://localhost:5000');

      if (formName === 'budgetForm') {
        endpoint = `${apiBase}/api/enquiry`;
        successMessage = 'Your event interest has been submitted successfully. Our team will contact you in 2-3 hours.';
      } else if (formName === 'registerForm') {
        endpoint = `${apiBase}/api/register`;
        successMessage = 'Registration successful! You can now log in and start planning your event.';
      } else if (formName === 'loginForm') {
        endpoint = `${apiBase}/api/login`;
        successMessage = 'Login successful. Welcome back to Event Plus!';
      }

      if (formName === 'budgetForm' && formData.cateringRequired === 'Yes' && cuisineChoices.length === 0) {
        status.textContent = 'Please select at least one food menu option.';
        status.style.color = '#d35a4f';
        return;
      }

      try {
        status.textContent = 'Submitting...';
        status.style.color = '#5f6476';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        });

        const responseText = await response.text();
        let result = {};

        if (responseText) {
          try {
            result = JSON.parse(responseText);
          } catch {
            result = { message: responseText };
          }
        }

        if (!response.ok) {
          throw new Error(result.message || 'Request failed');
        }

        status.textContent = result.message || successMessage;
        status.style.color = '#1fbf75';
        form.reset();

        if (formName === 'budgetForm') {
          localStorage.setItem('eventPlusOrderMessage', result.message || successMessage);
          window.location.href = 'thank-you.html';
          return;
        }

        if (formName === 'loginForm' && result.user) {
          localStorage.setItem('eventPlusUser', JSON.stringify(result.user));
          window.location.href = 'dashboard.html';
        }
      } catch (error) {
        status.textContent = error instanceof TypeError
          ? 'API server se connection nahi ho paaya. Please start the server on port 5000.'
          : (error.message || 'Something went wrong');
        status.style.color = '#d35a4f';
      }
    });
  });

  const eventDetails = {
    birthday: {
      title: 'Birthday Party', icon: '🎂', tagline: 'Joyful moments for every age.',
      description: 'A fun, colourful celebration planned around the birthday person, their guests and their favourite theme.',
      included: [['🎂', 'Cake & dessert table', 'Custom cake, candles, cupcakes and a styled cake table.'], ['🎈', 'Room decoration', 'Theme backdrop, balloons, welcome board and table décor.'], ['💡', 'Lighting & music', 'Warm party lighting, speaker setup and a ready playlist.'], ['🍕', 'Snacks & drinks', 'Welcome drinks, kid-friendly snacks and serving arrangement.'], ['🪑', 'Seating & comfort', 'Guest seating, tables, plates, glasses and clean-up support.'], ['📸', 'Games & memories', 'Fun games, activity corner and event photography moments.']],
      addons: ['Character mascot or live entertainer', 'Return gifts and themed invitations', 'Professional photography and video', 'Magic show, DJ or dance floor']
    },
    'baby-shower': {
      title: 'Baby Shower', icon: '🎀', tagline: 'Soft details for a beautiful welcome.',
      description: 'A warm, picture-perfect celebration with thoughtful décor, games, food and memories for the parents-to-be.',
      included: [['🎀', 'Theme decoration', 'Pastel backdrop, balloon arch, floral details and welcome signage.'], ['📸', 'Photo corner', 'Styled photo booth, props and a special family memory wall.'], ['🍰', 'Cake & refreshments', 'Baby-themed cake, mocktails, tea, snacks and dessert setup.'], ['🎲', 'Baby shower games', 'Games, quiz cards, prizes and an easy activity schedule.'], ['🪑', 'Guest seating', 'Comfortable seating, gift table, dining setup and serving staff.'], ['💡', 'Music & lighting', 'Soft ambient lighting, speaker and a calm celebration playlist.']],
      addons: ['Customized baby-name board', 'Return gifts for guests', 'Maternity photography corner', 'Catering menu upgrade']
    },
    'baby-home': {
      title: 'Baby Coming Home', icon: '🏡', tagline: 'A warm welcome for the newest family member.',
      description: 'A gentle homecoming setup that makes the first welcome feel personal, safe and full of love.',
      included: [['🏡', 'Home entrance décor', 'Floral welcome, balloons, name board and a clean photo-ready entry.'], ['🌸', 'Room styling', 'Soft flowers, safe baby-friendly décor and a welcome banner.'], ['🍲', 'Family refreshments', 'Tea, welcome drinks, snacks and a simple family meal.'], ['📸', 'Memory moments', 'Family photographs, welcome video clips and keepsake details.'], ['🪑', 'Guest arrangement', 'Seating, serving table and comfortable setup for close family.'], ['🧹', 'Setup & clean-up', 'Complete installation, event assistance and post-event clean-up.']],
      addons: ['Personalized baby welcome hamper', 'Floral crib or room décor', 'Professional homecoming photography', 'Customized sweets and return gifts']
    },
    'friend-party': {
      title: 'Friend Party', icon: '🥳', tagline: 'Good music, great food and your people.',
      description: 'A relaxed party setup with the right music, games, food and atmosphere for a memorable time together.',
      included: [['🎵', 'Music & sound', 'Speaker, microphone, playlist support and party-ready sound.'], ['🎉', 'Fun decoration', 'Theme décor, balloons, photo wall and table styling.'], ['🍔', 'Snacks & drinks', 'Party snacks, mocktails, water and a convenient food station.'], ['🎲', 'Games & activities', 'Group games, quiz, cards and entertainment coordination.'], ['🪩', 'Lighting setup', 'Party lights, disco lighting and a dance-friendly atmosphere.'], ['🪑', 'Seating & service', 'Lounge seating, tables, plates and service assistance.']],
      addons: ['DJ and dance floor', 'Live band or karaoke', 'Photo booth with props', 'Pizza, barbeque or mocktail counter']
    },
    'shop-opening': {
      title: 'Shop Opening', icon: '🏪', tagline: 'Launch your business with confidence.',
      description: 'A professional launch experience that welcomes customers, showcases your brand and creates a strong first impression.',
      included: [['🏪', 'Launch décor', 'Branded entrance, balloons, ribbons, flowers and opening setup.'], ['✂️', 'Inauguration ceremony', 'Ribbon, scissors, lamp or ceremonial setup with event flow.'], ['📣', 'Brand visibility', 'Welcome board, directional signs and branded display points.'], ['🍽️', 'Food & beverages', 'Welcome drinks, snacks and guest serving arrangement.'], ['🎤', 'Sound & announcements', 'Microphone, speaker and a simple launch program.'], ['📸', 'Media coverage', 'Photography, guest moments and launch-day highlights.']],
      addons: ['Professional launch video', 'Influencer or PR coordination', 'Branded gift hampers', 'Live counters or product showcase']
    },
    engagement: {
      title: 'Engagement Function', icon: '💍', tagline: 'Celebrate the beginning of forever.',
      description: 'An elegant engagement experience with beautiful décor, guest hospitality, food and a smooth ceremony flow.',
      included: [['💍', 'Stage & backdrop', 'Elegant stage, couple seating, floral backdrop and name signage.'], ['🌸', 'Floral decoration', 'Fresh or premium artificial flowers for the venue and entrance.'], ['💡', 'Lighting & sound', 'Stage lighting, ambient lights, microphone and music setup.'], ['🍽️', 'Catering service', 'Welcome drinks, starters, main course, dessert and water.'], ['📸', 'Photography', 'Couple portraits, family photographs and ceremony coverage.'], ['🪑', 'Guest hospitality', 'Seating, reception desk, gift table and event coordination.']],
      addons: ['Cinematic pre-event shoot', 'Live music or DJ', 'Premium floral upgrade', 'Customized invitation and return gifts']
    },
    'small-event': {
      title: 'Any Small Event', icon: '✨', tagline: 'Simple, personal and perfectly planned.',
      description: 'A flexible package for intimate dinners, family functions, office occasions, reunions and any small gathering.',
      included: [['✨', 'Custom event setup', 'A practical layout and décor plan based on your space and guest count.'], ['🍽️', 'Food & beverages', 'Snacks, drinks, water and a menu matched to your occasion.'], ['💡', 'Lighting & sound', 'Basic speaker, music and lighting for a comfortable atmosphere.'], ['🪑', 'Tables & seating', 'Guest seating, dining tables, servingware and arrangement.'], ['🎈', 'Simple decoration', 'Balloons, flowers, welcome sign and table centrepieces.'], ['🧹', 'Event assistance', 'Setup, coordination during the event and clean-up support.']],
      addons: ['Photography package', 'Themed décor upgrade', 'Catering menu upgrade', 'Games, host or live entertainment']
    }
  };

  const detailsPage = document.querySelector('.event-details-body');
  if (detailsPage) {
    const key = new URLSearchParams(window.location.search).get('type') || 'birthday';
    const event = eventDetails[key] || eventDetails.birthday;
    document.title = `${event.title} | Event Plus`;
    document.getElementById('eventTitle').textContent = event.title;
    document.getElementById('eventIcon').textContent = event.icon;
    document.getElementById('eventDescription').textContent = event.description;
    document.getElementById('eventTagline').textContent = event.tagline;
    document.getElementById('goToPlanButton').href = `event-packages.html?type=${encodeURIComponent(key)}`;
    document.getElementById('customPlanLink').href = `event-packages.html?type=${encodeURIComponent(key)}`;
    document.getElementById('includedGrid').innerHTML = event.included.map(([icon, title, text]) => `<article class="included-card"><span>${icon}</span><div><h3>${title}</h3><p>${text}</p></div></article>`).join('');
    document.getElementById('addonList').innerHTML = event.addons.map((addon) => `<li>${addon}</li>`).join('');
  }

  const eventPlanPage = document.querySelector('.event-plan-body');
  if (eventPlanPage) {
    const eventPlans = {
      birthday: ['Birthday Party', '🎂', 'A colourful celebration with cake, games, food and memorable décor.'],
      'baby-shower': ['Baby Shower', '🎀', 'A sweet pastel celebration for the parents-to-be.'],
      'baby-home': ['Baby Coming Home', '🏡', 'A warm family welcome with safe, beautiful home décor.'],
      'friend-party': ['Friend Party', '🥳', 'Good music, great food and a relaxed party atmosphere.'],
      'shop-opening': ['Shop Opening', '🏪', 'A professional launch setup for your new beginning.'],
      engagement: ['Engagement Function', '💍', 'An elegant celebration for your beautiful beginning.'],
      'small-event': ['Any Small Event', '✨', 'A flexible setup for intimate and personal gatherings.']
    };
    const planKey = new URLSearchParams(window.location.search).get('type') || 'birthday';
    const selectedPlan = eventPlans[planKey] || eventPlans.birthday;
    document.title = `${selectedPlan[0]} Plans | Event Plus`;
    document.getElementById('planEventIcon').textContent = selectedPlan[1];
    document.getElementById('planEventTitle').textContent = `${selectedPlan[0]} Plans`;
    document.getElementById('planEventDescription').textContent = selectedPlan[2];
    document.querySelectorAll('.event-package-card').forEach((card) => {
      const packageName = card.querySelector('h2').textContent;
      const cateringChoice = card.querySelector('.package-choose').dataset.catering || 'Yes';
      card.querySelector('.package-choose').href = `order-confirmation.html?event=${encodeURIComponent(selectedPlan[0])}&package=${encodeURIComponent(packageName)}&catering=${cateringChoice}`;
    });
  }

  const selectedEvent = new URLSearchParams(window.location.search).get('event');
  const selectedPackage = new URLSearchParams(window.location.search).get('package');
  const selectedCatering = new URLSearchParams(window.location.search).get('catering');
  const eventTypeSelect = document.querySelector('#budgetForm select[name="eventType"]');
  if (selectedEvent && eventTypeSelect) {
    const matchingOption = [...eventTypeSelect.options].find((option) => option.text.toLowerCase() === selectedEvent.toLowerCase());
    if (matchingOption) eventTypeSelect.value = matchingOption.value;
  }

  const packageSelect = document.getElementById('packageSelect');
  const guestCountInput = document.querySelector('#budgetForm input[name="guestCount"]');
  const budgetInput = document.getElementById('budgetInput');
  const cateringSelect = document.getElementById('cateringSelect');
  const cateringFields = document.getElementById('cateringFields');

  const packageIcons = {
    'Birthday Party': '🎂', 'Baby Shower': '🎀', 'Baby Coming Home': '🏡', 'Friend Party': '🥳',
    'Shop Opening': '🏪', 'Engagement Function': '💍', 'Small Event': '✨'
  };

  const selectedPackageName = selectedPackage || 'Package 1';
  const packageOption = packageSelect?.querySelector(`option[value="${selectedPackageName}"]`);
  if (packageOption && packageSelect) packageSelect.value = selectedPackageName;
  const selectedPackageNameNode = document.getElementById('selectedPackageName');
  const selectedPackageMetaNode = document.getElementById('selectedPackageMeta');
  const selectedPackageIconNode = document.getElementById('selectedPackageIcon');
  if (selectedPackageNameNode) selectedPackageNameNode.textContent = selectedPackageName;
  if (selectedPackageMetaNode && packageOption) selectedPackageMetaNode.textContent = `Up to ${packageOption.dataset.guests} people · ${selectedCatering === 'No' ? packageOption.dataset.noCateringBudget : packageOption.dataset.budget}`;
  if (selectedPackageIconNode && selectedEvent) selectedPackageIconNode.textContent = packageIcons[selectedEvent] || '✨';

  const confirmOrderButton = document.getElementById('confirmOrderButton');
  const finalConfirmationCheck = document.getElementById('finalConfirmationCheck');
  const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : (window.location.protocol === 'http:' || window.location.protocol === 'https:' ? window.location.origin : 'http://localhost:5000');

  const updateConfirmationState = () => {
    if (confirmOrderButton && finalConfirmationCheck) {
      confirmOrderButton.disabled = !finalConfirmationCheck.checked;
    }
  };

  finalConfirmationCheck?.addEventListener('change', updateConfirmationState);
  updateConfirmationState();

  const updatePackageBudget = (selectedPackageOption) => {
    if (!selectedPackageOption || !budgetInput) return;
    budgetInput.value = cateringSelect?.value === 'No'
      ? selectedPackageOption.dataset.noCateringBudget
      : selectedPackageOption.dataset.budget;
  };

  const initializePackageDefaults = () => {
    if (!packageSelect) return;
    const defaultPackage = packageSelect.options[packageSelect.selectedIndex] || packageSelect.options[0];
    if (!defaultPackage) return;
    if (!guestCountInput.value && defaultPackage.dataset.guests) {
      guestCountInput.value = defaultPackage.dataset.guests;
    }
    if (!budgetInput.value) {
      updatePackageBudget(defaultPackage);
    }
  };

  initializePackageDefaults();

  if (selectedPackage && packageSelect) {
    const matchingPackage = [...packageSelect.options].find((option) => option.value.toLowerCase() === selectedPackage.toLowerCase());
    if (matchingPackage) {
      packageSelect.value = matchingPackage.value;
      guestCountInput.value = matchingPackage.dataset.guests;
      updatePackageBudget(matchingPackage);
    }
  }

  packageSelect?.addEventListener('change', () => {
    const selectedPackage = packageSelect.options[packageSelect.selectedIndex];
    if (!selectedPackage?.dataset.guests) return;
    guestCountInput.value = selectedPackage.dataset.guests;
    updatePackageBudget(selectedPackage);
  });

  guestCountInput?.addEventListener('input', () => {
    const guestCount = Number(guestCountInput.value);
    const matchingPackage = [...packageSelect.options].find((option) => Number(option.dataset.guests) >= guestCount);
    if (matchingPackage) {
      packageSelect.value = matchingPackage.value;
      updatePackageBudget(matchingPackage);
    }
  });

  cateringSelect?.addEventListener('change', () => {
    const cateringEnabled = cateringSelect.value === 'Yes';
    cateringFields.hidden = !cateringEnabled;
    cateringFields.querySelectorAll('input').forEach((input) => {
      input.required = false;
      if (!cateringEnabled) input.checked = false;
    });
  });

  if (selectedCatering && cateringSelect) {
    cateringSelect.value = selectedCatering;
    cateringSelect.dispatchEvent(new Event('change'));
    updatePackageBudget(packageSelect?.options[packageSelect.selectedIndex]);
  }

  const dashboard = document.querySelector('.dashboard-body');
  if (!dashboard) return;

  const storedUser = JSON.parse(localStorage.getItem('eventPlusUser') || 'null');
  if (!storedUser) {
    window.location.href = 'login.html';
    return;
  }

  const firstName = storedUser?.name?.trim().split(' ')[0] || 'Planner';
  const userName = document.getElementById('userName');
  const welcomeName = document.getElementById('welcomeName');
  const userAvatar = document.getElementById('userAvatar');

  if (userName) userName.textContent = storedUser?.name || 'Event Planner';
  if (welcomeName) welcomeName.textContent = firstName;
  if (userAvatar) userAvatar.textContent = firstName.slice(0, 2).toUpperCase();

  const searchInput = document.getElementById('eventSearch');
  const eventRows = [...document.querySelectorAll('.event-row')];
  const eventTypeCards = [...document.querySelectorAll('.event-type-card')];
  const emptyEventState = document.getElementById('emptyEventState');
  const emptyEventTypeState = document.getElementById('emptyEventTypeState');

  searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    let visibleEvents = 0;

    eventRows.forEach((eventRow) => {
      const matches = eventRow.dataset.search.includes(query);
      eventRow.hidden = !matches;
      if (matches) visibleEvents += 1;
    });

    let visibleTypes = 0;
    eventTypeCards.forEach((eventTypeCard) => {
      const matches = eventTypeCard.dataset.search.includes(query);
      eventTypeCard.hidden = !matches;
      if (matches) visibleTypes += 1;
    });

    if (emptyEventState) emptyEventState.hidden = visibleEvents > 0;
    if (emptyEventTypeState) emptyEventTypeState.hidden = visibleTypes > 0;
  });

  document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.removeItem('eventPlusUser');
    window.location.href = 'login.html';
  });

  document.querySelector('.mobile-menu-button')?.addEventListener('click', () => {
    document.querySelector('.dashboard-sidebar')?.classList.toggle('is-open');
  });
});
