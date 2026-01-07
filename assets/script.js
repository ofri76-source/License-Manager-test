/* KBBM TEXT PASTE PARSER (FINAL) - supports ~ and long secrets */
(function(){
  function val(id){ var el=document.getElementById(id); return el?el.value:''; }
  function setVal(id,v){ var el=document.getElementById(id); if(el){ el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } }

  function parseFromText(text){
    // Normalize
    text = (text||'').replace(/\r/g,'');

    function pick(re){
      var m = re.exec(text);
      return m && m[1] ? m[1].trim() : '';
    }

    // Tenant ID
    var tenantId = pick(/Tenant\s*ID\s*:\s*([0-9a-fA-F-]{36})/i);

    // Client ID (allow "Application (Client) ID")
    var clientId = pick(/Application\s*\(Client\)\s*ID\s*:\s*([0-9a-fA-F-]{36})/i) || pick(/Client\s*ID\s*:\s*([0-9a-fA-F-]{36})/i);

    // Client Secret: capture anything non-empty after "Client Secret:" up to line end, including ~, ., _, -, etc.
    // Some portals wrap secrets; capture first non-space token after label.
    var clientSecret = pick(/Client\s*Secret\s*:\s*([^\n]+)\n?/i);
    if (clientSecret) {
      // If wrapped with spaces, keep as-is
      clientSecret = clientSecret.replace(/\s+/g,'').trim();
    }

    return { tenantId, clientId, clientSecret };
  }

  function bind(){
    // textarea where you paste
    var ta = document.querySelector('textarea[name="connection_test"], #connection_test, #m365_connection_test, textarea');
    var btn = document.getElementById('fill-fields-from-text') ||
              document.querySelector('button[data-action="fill-from-text"]') ||
              Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').includes('מלא שדות מהטקסט'));

    if (!btn || btn.__kbbm_final_bound) return;
    btn.__kbbm_final_bound = true;

    btn.addEventListener('click', function(){
      var text = ta ? ta.value : '';
      var p = parseFromText(text);

      // These are the main form field IDs in your UI
      if (p.tenantId) setVal('customer-tenant-id', p.tenantId);
      if (p.clientId) setVal('customer-client-id', p.clientId);
      if (p.clientSecret) setVal('customer-client-secret', p.clientSecret);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 500);
})();

jQuery(document).ready(function($) {

    const dcCustomers = Array.isArray(m365Ajax.dcCustomers) ? m365Ajax.dcCustomers : [];
    const customerFormWrapper = $('#customer-form-wrapper');
    const customerFormPlaceholder = $('#customer-form-placeholder');
    const customerForm = $('#customer-form');
    let additionalTenantsContainer = $('#additional-tenants');
    const tenantOnlyForm = $('#tenant-only-form');
    const tenantOnlyInnerForm = $('#tenant-only-form-inner');

    function ensureTenantControls() {
        if (!customerForm.length) {
            return;
        }

        const hasContainer = customerForm.find('#additional-tenants').length > 0;
        const hasButton = customerForm.find('#add-tenant-row').length > 0;
        const hasHidden = customerForm.find('#customer-tenants-json').length > 0;

        if (hasContainer && hasButton && hasHidden) {
            additionalTenantsContainer = customerForm.find('#additional-tenants');
            return;
        }

        const fragment = $(`
            <div id="additional-tenants"></div>
            <div class="form-group">
                <button type="button" id="add-tenant-row" class="m365-btn m365-btn-small">
                    הוסף טננט נוסף
                </button>
            </div>
            <input type="hidden" id="customer-tenants-json" name="tenants" value="[]">
        `);

        const tenantDomainGroup = customerForm.find('#customer-tenant-domain').closest('.form-group');
        if (tenantDomainGroup.length) {
            tenantDomainGroup.after(fragment);
        } else {
            customerForm.append(fragment);
        }

        additionalTenantsContainer = customerForm.find('#additional-tenants');
    }

    ensureTenantControls();

    function serializeTenants() {
        const tenants = [];

        const primary = {
            tenant_id: $('#customer-tenant-id').val() || '',
            tenant_domain: $('#customer-tenant-domain').val() || '',
            client_id: $('#customer-client-id').val() || '',
            client_secret: $('#customer-client-secret').val() || ''
        };

        tenants.push(primary);

        additionalTenantsContainer.find('.additional-tenant-row').each(function() {
            const row = $(this);
            tenants.push({
                tenant_id: row.find('.tenant-id').val() || '',
                tenant_domain: row.find('.tenant-domain').val() || '',
                client_id: row.find('.tenant-client-id').val() || '',
                client_secret: row.find('.tenant-client-secret').val() || ''
            });
        });

        $('#customer-tenants-json').val(JSON.stringify(tenants));
    }

    function addAdditionalTenantRow(data = {}) {
        const row = $(`
            <div class="additional-tenant-row" style="border:1px solid #ddd; padding:10px; margin-top:10px;">
                <div class="form-group">
                    <label>Tenant ID:</label>
                    <input type="text" class="tenant-id" value="${data.tenant_id || ''}">
                </div>
                <div class="form-group">
                    <label>Client ID:</label>
                    <input type="text" class="tenant-client-id" value="${data.client_id || ''}">
                </div>
                <div class="form-group">
                    <label>Client Secret:</label>
                    <input type="password" class="tenant-client-secret" value="${data.client_secret || ''}">
                </div>
                <div class="form-group">
                    <label>Tenant Domain:</label>
                    <input type="text" class="tenant-domain" value="${data.tenant_domain || ''}" placeholder="example.onmicrosoft.com">
                </div>
                <button type="button" class="m365-btn m365-btn-small m365-btn-danger remove-tenant-row">הסר</button>
            </div>
        `);

        additionalTenantsContainer.append(row);
        serializeTenants();
    }
    let inlineFormRow = null;

    function hideCustomerForm() {
        if (inlineFormRow) {
            inlineFormRow.remove();
            inlineFormRow = null;
        }

        if (customerFormPlaceholder.length) {
            customerFormPlaceholder.after(customerFormWrapper);
        }

        customerFormWrapper.hide();
    }

    function showCustomerFormUnderRow(row) {
        if (!row || !row.length) {
            return;
        }

        if (inlineFormRow) {
            inlineFormRow.remove();
        }

        inlineFormRow = $('<tr class="inline-form-row"><td colspan="6"></td></tr>');
        inlineFormRow.find('td').append(customerFormWrapper);
        row.after(inlineFormRow);
        customerFormWrapper.show();
        $('html, body').animate({ scrollTop: customerFormWrapper.offset().top - 60 }, 300);
    }

    function showCustomerFormInPlaceholder() {
        if (inlineFormRow) {
            inlineFormRow.remove();
            inlineFormRow = null;
        }

        if (customerFormPlaceholder.length) {
            customerFormPlaceholder.after(customerFormWrapper);
        }

        customerFormWrapper.show();
        $('html, body').animate({ scrollTop: customerFormWrapper.offset().top - 60 }, 300);
    }

    if (customerFormWrapper.length) {
        customerFormWrapper.hide();
    }

    function updatePlansHeaderVisibility(customerId, isOpen) {
        const selector = customerId ? `.plans-header-row[data-customer='${customerId}']` : '.plans-header-row';
        const targetRows = $(selector);

        if (typeof isOpen !== 'undefined') {
            targetRows.toggleClass('visible', isOpen);
            targetRows.css('display', isOpen ? 'table-row' : 'none');
            return;
        }

        const hasVisible = $('.license-row:visible').length > 0;
        targetRows.toggleClass('visible', hasVisible);
        targetRows.css('display', hasVisible ? 'table-row' : 'none');
    }

    // סנכרון רישיונות
    $('#sync-licenses').on('click', function() {
        const customerId = $('#customer-select').val();

        if (!customerId) {
            showMessage('error', 'בחר לקוח לסנכרון');
            return;
        }

        $(this).prop('disabled', true).text('מסנכרן...');

        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: {
                action: 'm365_sync_licenses',
                nonce: m365Ajax.nonce,
                customer_id: customerId
            },
            success: function(response) {
                if (response.success) {
                    const msg = response.data && response.data.message ? response.data.message : 'סנכרון הושלם בהצלחה';
                    const count = response.data && typeof response.data.count !== 'undefined' ? response.data.count : 0;
                    showMessage('success', `${msg} - ${count} רישיונות`);
                    setTimeout(function() {
                        location.reload();
                    }, 2000);
                } else {
                    const msg = response && response.data && response.data.message ? response.data.message : 'שגיאת Graph כללית';
                    showMessage('error', msg);
                }
            },
            error: function() {
                showMessage('error', 'שגיאה בתקשורת עם השרת');
            },
            complete: function() {
                $('#sync-licenses').prop('disabled', false).text('סנכרון רישיונות');
            }
        });
    });

    // סנכרון כל הלקוחות
    $('#sync-all-licenses').on('click', function() {
        const button = $(this);
        button.prop('disabled', true).text('מסנכרן הכל...');

        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: {
                action: 'm365_sync_all_licenses',
                nonce: m365Ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    const count = response.data && typeof response.data.count !== 'undefined' ? response.data.count : 0;
                    showMessage('success', `סנכרון הושלם לכל הלקוחות (${count})`);
                    setTimeout(function() { location.reload(); }, 2000);
                } else {
                    const msg = response && response.data && response.data.message ? response.data.message : 'שגיאה כללית בסנכרון הכל';
                    showMessage('error', msg);
                }
            },
            error: function() {
                showMessage('error', 'שגיאה בתקשורת עם השרת');
            },
            complete: function() {
                button.prop('disabled', false).text('סנכרון הכל');
            }
        });
    });
    
    // עריכת רישיון
    $(document).on('click', '.edit-license', function() {
        const row = $(this).closest('tr');
        const id = row.data('id');

        // מילוי הנתונים מהשורה
        $('#license-id').val(id);
        $('#license-customer-id').val(row.data('customer'));
        $('#license-plan-name').val(row.find('.plan-name').text().trim());
        $('#license-billing-account').val(row.find('[data-field="billing_account"]').text().trim());
        $('#license-cost').val(row.find('[data-field="cost_price"]').text().trim());
        $('#license-selling').val(row.find('[data-field="selling_price"]').text().trim());
        $('#license-quantity').val(row.data('quantity') || row.data('enabled') || 0);

        const billingCycle = row.data('billing-cycle') || 'monthly';
        $('#license-billing-cycle').val(billingCycle);
        $('#license-billing-frequency').val(row.data('billing-frequency') || '');
        $('#license-renewal-date').val(row.find('[data-field="renewal_date"]').text().trim());
        $('#license-notes').val(row.data('notes') || '');

        $('#edit-license-modal').fadeIn();
    });

    function buildLicensePayloadFromRow(row) {
        return {
            action: 'm365_save_license',
            nonce: m365Ajax.nonce,
            id: row.data('id') || 0,
            customer_id: row.data('customer') || '',
            plan_name: row.find('.plan-name').text().trim(),
            billing_account: row.find('[data-field="billing_account"]').text().trim(),
            cost_price: parseFloat(row.find('[data-field="cost_price"]').text()) || 0,
            selling_price: parseFloat(row.find('[data-field="selling_price"]').text()) || 0,
            quantity: row.data('quantity') || row.data('enabled') || 0,
            billing_cycle: row.data('billing-cycle') || 'monthly',
            billing_frequency: row.data('billing-frequency') || '',
            renewal_date: row.find('[data-field="renewal_date"]').text().trim(),
            notes: row.data('notes') || ''
        };
    }

    $('.kbbm-report-table').on('click', '.editable-price', function(event) {
        event.stopPropagation();
        const cell = $(this);
        const row = cell.closest('tr');

        if (cell.find('input').length) {
            return;
        }

        const currentValue = cell.text().trim();
        const field = cell.data('field');
        const input = $('<input type="number" step="0.01" class="inline-price-input" />').val(currentValue);

        cell.addClass('editing');
        cell.empty().append(input);
        input.trigger('focus').select();

        function finishEdit(cancel) {
            const newValue = cancel ? currentValue : input.val();
            cell.removeClass('editing');
            cell.text(newValue);
        }

        input.on('keydown', function(e) {
            if (e.key === 'Escape') {
                finishEdit(true);
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                input.trigger('blur');
            }
        });

        input.on('blur', function() {
            const newValue = input.val();
            const payload = buildLicensePayloadFromRow(row);
            payload[field] = parseFloat(newValue) || 0;

            $.ajax({
                url: m365Ajax.ajaxurl,
                type: 'POST',
                data: payload,
                success: function(response) {
                    if (response && response.success) {
                        cell.text(payload[field]);
                    } else {
                        showMessage('error', 'שמירת המחיר נכשלה');
                        cell.text(currentValue);
                    }
                },
                error: function() {
                    showMessage('error', 'שמירת המחיר נכשלה');
                    cell.text(currentValue);
                },
                complete: function() {
                    cell.removeClass('editing');
                }
            });
        });
    });

    // שמירת רישיון
    $('#edit-license-form').on('submit', function(e) {
        e.preventDefault();

        const formData = new FormData(this);
        formData.append('action', 'm365_save_license');
        formData.append('nonce', m365Ajax.nonce);

        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                if (response.success) {
                    showMessage('success', 'הרישיון נשמר בהצלחה');
                    setTimeout(function() {
                        location.reload();
                    }, 1500);
                } else {
                    showMessage('error', 'שגיאה בשמירת הרישיון');
                }
            },
            error: function() {
                showMessage('error', 'שגיאה בתקשורת עם השרת');
            }
        });
    });
    
    // מחיקת רישיון (רכה)
    $(document).on('click', '.delete-license', function() {
        if (!confirm('האם אתה בטוח שברצונך למחוק רישיון זה?')) {
            return;
        }
        
        const id = $(this).data('id');
        const row = $(this).closest('tr');
        
        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: {
                action: 'm365_delete_license',
                nonce: m365Ajax.nonce,
                id: id
            },
            success: function(response) {
                if (response.success) {
                    row.fadeOut(function() {
                        $(this).remove();
                    });
                    showMessage('success', 'הרישיון הועבר לסל המחזור');
                }
            }
        });
    });
    
    // שחזור רישיון
    $(document).on('click', '.restore-license', function() {
        const id = $(this).data('id');
        const row = $(this).closest('tr');
        
        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: {
                action: 'm365_restore_license',
                nonce: m365Ajax.nonce,
                id: id
            },
            success: function(response) {
                if (response.success) {
                    row.fadeOut(function() {
                        $(this).remove();
                    });
                    showMessage('success', 'הרישיון שוחזר בהצלחה');
                }
            }
        });
    });
    
    // מחיקה קשה של רישיון בודד
    $(document).on('click', '.hard-delete-license', function() {
        if (!confirm('האם אתה בטוח? פעולה זו בלתי הפיכה!')) {
            return;
        }
        
        const id = $(this).data('id');
        const row = $(this).closest('tr');
        
        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: {
                action: 'm365_hard_delete',
                nonce: m365Ajax.nonce,
                id: id
            },
            success: function(response) {
                if (response.success) {
                    row.fadeOut(function() {
                        $(this).remove();
                    });
                    showMessage('success', 'הרישיון נמחק לצמיתות');
                }
            }
        });
    });
    
    // מחיקת כל הרישיונות לצמיתות
    $('#delete-all-permanent').on('click', function() {
        if (!confirm('האם אתה בטוח שברצונך למחוק את כל הרישיונות לצמיתות? פעולה זו בלתי הפיכה!')) {
            return;
        }
        
        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: {
                action: 'm365_hard_delete',
                nonce: m365Ajax.nonce,
                id: 0  // 0 = מחק הכל
            },
            success: function(response) {
                if (response.success) {
                    showMessage('success', 'כל הרישיונות נמחקו לצמיתות');
                    setTimeout(function() {
                        location.reload();
                    }, 1500);
                }
            }
        });
    });
    
    const tabStorageKey = 'kbbmSettingsActiveTab';

    function setActiveTab(tab) {
        if (!tab || !$(`#${tab}-tab`).length) {
            tab = 'customers';
        }

        $('.m365-tab-btn').removeClass('active');
        $(`.m365-tab-btn[data-tab='${tab}']`).addClass('active');

        $('.m365-tab-content').removeClass('active');
        $(`#${tab}-tab`).addClass('active');

        localStorage.setItem(tabStorageKey, tab);
    }

    const savedTab = localStorage.getItem(tabStorageKey);
    if (savedTab) {
        setActiveTab(savedTab);
    }

    // טאבים בהגדרות
    $('.m365-tab-btn').on('click', function() {
        const tab = $(this).data('tab');
        setActiveTab(tab);
    });

    // חיפוש לקוח קיים מהתוסף המרכזי
    function renderCustomerResults(results) {
        const resultsContainer = $('#customer-lookup-results');
        resultsContainer.empty();

        if (!results.length) {
            resultsContainer.hide();
            return;
        }

        results.forEach(function(customer) {
            const item = $('<div class="customer-result"></div>').text(
                `${customer.customer_number} - ${customer.customer_name}`
            );
            item.data('customer', customer);
            resultsContainer.append(item);
        });

        resultsContainer.show();
    }

    $('#customer-lookup').on('input', function() {
        const term = $(this).val().toLowerCase();

        if (!term) {
            renderCustomerResults([]);
            return;
        }

        const matches = dcCustomers.filter(function(customer) {
            return (
                (customer.customer_name && customer.customer_name.toLowerCase().includes(term)) ||
                (customer.customer_number && customer.customer_number.toLowerCase().includes(term))
            );
        });

        renderCustomerResults(matches);
    });

    $(document).on('click', '.customer-result', function() {
        const customer = $(this).data('customer');
        if (!customer) {
            return;
        }

        $('#customer-number').val(customer.customer_number || '');
        $('#customer-name').val(customer.customer_name || '');
        $('#customer-lookup-results').hide();
    });

    $(document).on('click', function(event) {
        if (!$(event.target).closest('.customer-lookup').length) {
            $('#customer-lookup-results').hide();
        }
    });

    const tenantFieldSelectors = '#customer-tenant-id, #customer-client-id, #customer-client-secret, #customer-tenant-domain';

    $(document).on('input change', `${tenantFieldSelectors}, .additional-tenant-row input`, function() {
        serializeTenants();
    });

    // הוספת לקוח
    $('#add-customer').on('click', function() {
        $('#customer-modal-title').text('הוסף לקוח חדש');
        $('#customer-form')[0].reset();
        $('#customer-id').val('');
        $('#customer-lookup').val('');
        $('#customer-secret-expiry').val('');
        $('#customer-lookup-results').hide();
        $('#customer-paste-source').val('');
        additionalTenantsContainer.empty();
        $('#customer-tenants-json').val('[]');

        showCustomerFormInPlaceholder();
    });

    // עריכת לקוח
    $(document).on('click', '.edit-customer, .kbbm-edit-customer', function(e) {
        e.preventDefault();

        const id = $(this).data('id');
        if (!id) {
            return;
        }

        $.post(m365Ajax.ajaxurl, {
            action: 'kbbm_get_customer',
            nonce: m365Ajax.nonce,
            id: id
        }, function(response) {
            if (response && response.success && response.data) {
                const customer = response.data;
                $('#customer-modal-title').text('עריכת לקוח');
                $('#customer-id').val(customer.id || '');
                $('#customer-number').val(customer.customer_number || '');
                $('#customer-name').val(customer.customer_name || '');
                $('#customer-tenant-id').val(customer.tenant_id || '');
                $('#customer-client-id').val(customer.client_id || '');
                $('#customer-client-secret').val(customer.client_secret || '');
                $('#customer-secret-expiry').val(customer.client_secret_expires_at || '');
                $('#customer-tenant-domain').val(customer.tenant_domain || '');
                $('#customer-paste-source').val('');
                additionalTenantsContainer.empty();
                $('#customer-tenants-json').val('[]');
                if (customer.tenants && customer.tenants.length > 0) {
                    customer.tenants.forEach(function(tenant, index) {
                        if (index === 0) {
                            $('#customer-tenant-id').val(tenant.tenant_id || customer.tenant_id || '');
                            $('#customer-client-id').val(tenant.client_id || customer.client_id || '');
                            $('#customer-client-secret').val(tenant.client_secret || customer.client_secret || '');
                            $('#customer-tenant-domain').val(tenant.tenant_domain || customer.tenant_domain || '');
                        } else {
                            addAdditionalTenantRow({
                                tenant_id: tenant.tenant_id,
                                client_id: tenant.client_id,
                                client_secret: tenant.client_secret,
                                tenant_domain: tenant.tenant_domain
                            });
                        }
                    });
                }
                serializeTenants();

                const row = $(e.target).closest('tr');
                if (row.length) {
                    showCustomerFormUnderRow(row);
                } else {
                    showCustomerFormInPlaceholder();
                }
            } else {
                alert('לקוח לא נמצא');
            }
        });
    });

    $('#customer-paste-fill').on('click', function() {
        const raw = ($('#customer-paste-source').val() || '').trim();
        if (!raw) return;

        const patterns = [
            { selector: '#customer-tenant-id', regex: /Tenant\s*ID[:=\s]+([0-9a-fA-F-]{8,})/i },
            { selector: '#customer-client-id', regex: /Client\s*ID[:=\s]+([0-9a-fA-F-]{8,})/i },
            { selector: '#customer-client-id', regex: /Application\s*\(Client\)\s*ID[:=\s]+([0-9a-fA-F-]{8,})/i },
            { selector: '#customer-client-secret', regex: /Client\s*Secret[:=\s]+([A-Za-z0-9\-_.+/=]{8,})/i },
            { selector: '#customer-tenant-domain', regex: /Tenant\s*Domain[:=\s]+([\w\.-]+\.[\w\.\-]+)/i },
            { selector: '#customer-number', regex: /Customer\s*Number[:=\s]+([\w-]+)/i },
            { selector: '#customer-name', regex: /Customer\s*Name[:=\s]+(.+)/i },
        ];

        patterns.forEach(function(mapper) {
            if ($(mapper.selector).length) {
                const match = raw.match(mapper.regex);
                if (match && match[1]) {
                    $(mapper.selector).val(match[1].trim());
                }
            }
        });
    });

    $(document).on('click', '#add-tenant-row', function() {
        ensureTenantControls();
        addAdditionalTenantRow();
    });

    $('#add-tenant-only').on('click', function() {
        if (tenantOnlyForm.length) {
            tenantOnlyForm.toggle();
            $('html, body').animate({ scrollTop: tenantOnlyForm.offset().top - 60 }, 300);
        }
    });

    tenantOnlyInnerForm.on('submit', function(e) {
        e.preventDefault();

        const customerId = $('#tenant-only-customer-select').val();
        const tenantId = $('#tenant-only-tenant-id').val().trim();
        const clientId = $('#tenant-only-client-id').val().trim();
        const clientSecret = $('#tenant-only-client-secret').val().trim();
        const tenantDomain = $('#tenant-only-tenant-domain').val().trim();

        if (!customerId) {
            alert('בחר לקוח');
            return;
        }
        if (!tenantId) {
            alert('Tenant ID נדרש');
            return;
        }

        $.post(m365Ajax.ajaxurl, {
            action: 'kbbm_add_tenant',
            nonce: m365Ajax.nonce,
            customer_id: customerId,
            tenant_id: tenantId,
            client_id: clientId,
            client_secret: clientSecret,
            tenant_domain: tenantDomain,
        }, function(response) {
            if (response && response.success) {
                showMessage('success', response.data && response.data.message ? response.data.message : 'טננט נוסף');
                setTimeout(function() { location.reload(); }, 1000);
            } else {
                const message = response && response.data && response.data.message ? response.data.message : 'שגיאה בהוספת טננט';
                alert(message);
            }
        });
    });

    $(document).on('click', '.remove-tenant-row', function() {
        $(this).closest('.additional-tenant-row').remove();
        serializeTenants();
    });

    // מחיקת לקוח
    $(document).on('click', '.delete-customer, .kbbm-delete-customer', function(e) {
        e.preventDefault();

        const id = $(this).data('id');
        if (!id || !confirm('Delete this customer?')) {
            return;
        }

        $.post(m365Ajax.ajaxurl, {
            action: 'kbbm_delete_customer',
            nonce: m365Ajax.nonce,
            id: id
        }, function(response) {
            if (response && response.success) {
                location.reload();
            } else {
                const message = response && response.data && response.data.message ? response.data.message : 'שגיאה במחיקת הלקוח';
                alert(message);
            }
        });
    });

    // בדיקת חיבור
    $(document).on('click', '.kbbm-test-connection', function(e) {
        e.preventDefault();

        const btn = $(this);
        const id = btn.data('id');
        const statusEl = $(`#connection-status-${id}`);

        if (!id) return;

        btn.prop('disabled', true).text('בודק...');

        $.post(m365Ajax.ajaxurl, {
            action: 'kbbm_test_connection',
            nonce: m365Ajax.nonce,
            id: id
        }, function(response) {
            const message = response && response.data && response.data.message ? response.data.message : '';
            if (response && response.success) {
                updateStatus(statusEl, 'connected', message);
            } else {
                updateStatus(statusEl, 'failed', message || 'חיבור נכשל');
                alert(message || 'חיבור נכשל');
            }
        }).always(function() {
            btn.prop('disabled', false).text('בדוק חיבור');
        });
    });

    function submitCustomerForm(testAfterSave) {
        serializeTenants();

        const formData = customerForm.serializeArray();
        formData.push({ name: 'action', value: 'kbbm_save_customer' });
        formData.push({ name: 'nonce', value: m365Ajax.nonce });

        if (testAfterSave) {
            formData.push({ name: 'test_after_save', value: '1' });
        }

        $.ajax({
            url: m365Ajax.ajaxurl,
            type: 'POST',
            data: $.param(formData),
            success: function(response) {
                if (response.success) {
                    const responseData = response.data || {};
                    const message = responseData.test_message || responseData.message || 'הלקוח נשמר בהצלחה';
                    const testSuccess = testAfterSave ? responseData.test_success : null;
                    if (testAfterSave && testSuccess === false) {
                        showMessage('error', message);
                    } else {
                        showMessage('success', message);
                    }
                    setTimeout(function() {
                        location.reload();
                    }, testAfterSave ? 2000 : 1500);
                } else {
                    const errorMessage = response && response.data && response.data.message ? response.data.message : 'שגיאה בשמירת הלקוח';
                    showMessage('error', errorMessage);
                }
            }
        });
    }

    // שמירת לקוח
    customerForm.on('submit', function(e) {
        e.preventDefault();
        submitCustomerForm(false);
    });

    $('#customer-save-test').on('click', function() {
        submitCustomerForm(true);
    });

    // יצירת סקריפט API + תצוגה במודאל
    $('#generate-api-script').on('click', function() {
        const customerId = $('#api-customer-select').val();
        const downloadBase = $('#api-customer-select').data('download-base') || '';
        const button = $(this);

        if (!customerId) {
            alert('בחר לקוח');
            return;
        }

        button.prop('disabled', true).text('יוצר סקריפט...');

        $.post(m365Ajax.ajaxurl, {
            action: 'kbbm_generate_script',
            nonce: m365Ajax.nonce,
            customer_id: customerId
        }).done(function(response) {
            if (response && response.success && response.data && typeof response.data.script === 'string') {
                const data = response.data;
                $('#kbbm-script-preview').val(data.script);
                $('#kbbm-script-modal').fadeIn();
                $('#api-script-output').show();
                $('#api-script-text').val(data.script);
                $('#download-api-script, #kbbm-download-script').attr('href', data.download_url || (downloadBase + customerId));
                $('#kbbm-tenant-id').text(data.tenant_id || '');
                $('#kbbm-client-id').text(data.client_id || '');
                $('#kbbm-client-secret').text(data.client_secret || '');
                $('#kbbm-tenant-domain').text(data.tenant_domain || '');
            } else if (response && typeof response.script === 'string') {
                $('#kbbm-script-preview').val(response.script);
                $('#api-script-output').show();
                $('#api-script-text').val(response.script);
                $('#kbbm-script-modal').fadeIn();
                $('#kbbm-download-script, #download-api-script').attr('href', downloadBase + customerId);
            } else {
                const message = response && response.data && response.data.message ? response.data.message : 'לא ניתן ליצור סקריפט עבור הלקוח הנבחר';
                alert(message);
            }
        }).fail(function() {
            alert('שגיאה ביצירת הסקריפט');
        }).always(function() {
            button.prop('disabled', false).text('צור סקריפט');
        });
    });

    // פתיחה/סגירה של פירוט לקוחות בדף הראשי
    $(document).on('click', '.customer-summary', function() {
        const customerId = $(this).data('customer');
        const relatedRows = $(`.plans-header-row[data-customer='${customerId}'], .license-row[data-customer='${customerId}'], .kb-notes-row[data-customer='${customerId}']`);

        if (!relatedRows.length) {
            return;
        }

        const isOpen = $(this).hasClass('open');
        $(this).toggleClass('open');

        if (isOpen) {
            relatedRows.hide();
            updatePlansHeaderVisibility(customerId, false);
        } else {
            relatedRows.each(function() {
                $(this).css('display', 'table-row');
            });
            updatePlansHeaderVisibility(customerId, true);
        }
    });

    // פילטרים למסך התראות
    function applyAlertsFilters() {
        const customer = ($('#alerts-filter-customer').val() || '').toLowerCase();
        const license  = ($('#alerts-filter-license').val() || '').toLowerCase();
        const fromVal  = $('#alerts-filter-from').val();
        const toVal    = $('#alerts-filter-to').val();

        const fromDate = fromVal ? new Date(fromVal) : null;
        const toDate   = toVal ? new Date(toVal + 'T23:59:59') : null;

        $('#kbbm-alerts-table tbody tr').each(function() {
            const row = $(this);
            let show = true;

            if (customer) {
                const haystack = ((row.data('customer-name') || '') + ' ' + (row.data('customer-number') || '')).toLowerCase();
                if (!haystack.includes(customer)) {
                    show = false;
                }
            }

            if (show && license) {
                const haystack = ((row.data('license-name') || '') + ' ' + (row.data('license-sku') || '')).toLowerCase();
                if (!haystack.includes(license)) {
                    show = false;
                }
            }

            if (show && (fromDate || toDate)) {
                const rowTime = new Date(row.data('event-time'));
                if (fromDate && rowTime < fromDate) {
                    show = false;
                }
                if (toDate && rowTime > toDate) {
                    show = false;
                }
            }

            row.toggle(show);
        });
    }

    if ($('#kbbm-alerts-table').length) {
        $('#alerts-filter-customer, #alerts-filter-license, #alerts-filter-from, #alerts-filter-to').on('input change', function() {
            applyAlertsFilters();
        });

        $('#alerts-reset-filters').on('click', function() {
            $('#alerts-filter-customer, #alerts-filter-license, #alerts-filter-from, #alerts-filter-to').val('');
            applyAlertsFilters();
        });

        applyAlertsFilters();
    }

    // עריכת סוגי רישיון (טאב הגדרות)
    $(document).on('click', '.license-type-edit', function() {
        const row = $(this).closest('tr');

        $('#license-type-sku').val(row.data('sku'));
        $('#license-type-name').val(row.data('name'));
        $('#license-type-display-name').val(row.data('display-name'));
        $('#license-type-priority-sku').val(row.data('priority-sku'));
        $('#license-type-priority-name').val(row.data('priority-name'));
        $('#license-type-cost').val(row.data('cost-price'));
        $('#license-type-selling').val(row.data('selling-price'));
        $('#license-type-cycle').val(row.data('billing-cycle'));
        $('#license-type-frequency').val(row.data('billing-frequency'));
        $('#license-type-show').prop('checked', Number(row.data('show-in-main')) === 1);

        $('#license-type-modal').fadeIn();
    });

    $('#kbbm-license-type-form').on('submit', function(e) {
        e.preventDefault();

        const formData = {
            action: 'm365_save_license_type',
            nonce: m365Ajax.nonce,
            sku: $('#license-type-sku').val(),
            name: $('#license-type-name').val(),
            display_name: $('#license-type-display-name').val(),
            priority_sku: $('#license-type-priority-sku').val(),
            priority_name: $('#license-type-priority-name').val(),
            cost_price: $('#license-type-cost').val(),
            selling_price: $('#license-type-selling').val(),
            billing_cycle: $('#license-type-cycle').val(),
            billing_frequency: $('#license-type-frequency').val(),
            show_in_main: $('#license-type-show').is(':checked') ? 1 : 0,
        };

        $.post(m365Ajax.ajaxurl, formData, function(response) {
            if (response && response.success) {
                showMessage('success', response.data && response.data.message ? response.data.message : 'סוג הרישיון נשמר');
                localStorage.setItem(tabStorageKey, 'license-types');
                setTimeout(function() { location.reload(); }, 800);
            } else {
                const msg = response && response.data && response.data.message ? response.data.message : 'שגיאה בשמירת סוג הרישיון';
                showMessage('error', msg);
            }
        });
    });

    // פתיחה/סגירה של פירוט לקוחות בדף הראשי
    $(document).on('click', '.customer-summary', function() {
        const customerId = $(this).data('customer');
        const relatedRows = $(`.license-row[data-customer='${customerId}'], .kb-notes-row[data-customer='${customerId}']`);

        if (!relatedRows.length) {
            return;
        }

        const isOpen = $(this).hasClass('open');
        $(this).toggleClass('open');
        relatedRows.toggle(!isOpen);
        updatePlansHeaderVisibility();
    });

    // עריכת סוגי רישיון (טאב הגדרות)
    $(document).on('click', '.license-type-edit', function() {
        const row = $(this).closest('tr');

        $('#license-type-sku').val(row.data('sku'));
        $('#license-type-name').val(row.data('name'));
        $('#license-type-display-name').val(row.data('display-name'));
        $('#license-type-priority-sku').val(row.data('priority-sku'));
        $('#license-type-priority-name').val(row.data('priority-name'));
        $('#license-type-cost').val(row.data('cost-price'));
        $('#license-type-selling').val(row.data('selling-price'));
        $('#license-type-cycle').val(row.data('billing-cycle'));
        $('#license-type-frequency').val(row.data('billing-frequency'));
        $('#license-type-show').prop('checked', Number(row.data('show-in-main')) === 1);

        $('#license-type-modal').fadeIn();
    });

    $('#kbbm-license-type-form').on('submit', function(e) {
        e.preventDefault();

        const formData = {
            action: 'm365_save_license_type',
            nonce: m365Ajax.nonce,
            sku: $('#license-type-sku').val(),
            name: $('#license-type-name').val(),
            display_name: $('#license-type-display-name').val(),
            priority_sku: $('#license-type-priority-sku').val(),
            priority_name: $('#license-type-priority-name').val(),
            cost_price: $('#license-type-cost').val(),
            selling_price: $('#license-type-selling').val(),
            billing_cycle: $('#license-type-cycle').val(),
            billing_frequency: $('#license-type-frequency').val(),
            show_in_main: $('#license-type-show').is(':checked') ? 1 : 0,
        };

        $.post(m365Ajax.ajaxurl, formData, function(response) {
            if (response && response.success) {
                showMessage('success', response.data && response.data.message ? response.data.message : 'סוג הרישיון נשמר');
                setTimeout(function() { location.reload(); }, 1000);
            } else {
                const msg = response && response.data && response.data.message ? response.data.message : 'שגיאה בשמירת סוג הרישיון';
                showMessage('error', msg);
            }
        });
    });

    // פתיחה/סגירה של פירוט לקוחות בדף הראשי
    $(document).on('click', '.customer-summary', function() {
        const customerId = $(this).data('customer');
        const relatedRows = $(`.license-row[data-customer='${customerId}'], .kb-notes-row[data-customer='${customerId}']`);

        if (!relatedRows.length) {
            return;
        }

        const isOpen = $(this).hasClass('open');
        $(this).toggleClass('open');
        relatedRows.toggle(!isOpen);
    });

    // העתקת סקריפט API
    $('#kbbm-copy-script, #copy-api-script').on('click', function() {
        const scriptText = $('#kbbm-script-preview').val() || $('#api-script-text').val();

        if (navigator.clipboard && scriptText) {
            navigator.clipboard.writeText(scriptText).then(() => {
                $('#kbbm-copy-script, #copy-api-script').text('הועתק!').prop('disabled', true);
                setTimeout(function() {
                    $('#kbbm-copy-script').text('Copy Script').prop('disabled', false);
                    $('#copy-api-script').text('העתק ללוח').prop('disabled', false);
                }, 2000);
            });
        } else {
            const textArea = $('#kbbm-script-preview').length ? $('#kbbm-script-preview') : $('#api-script-text');
            textArea.trigger('select');
            document.execCommand('copy');
        }
    });
    
    // סגירת Modal
    $('.m365-modal-close, .m365-modal-cancel').on('click', function() {
        if ($(this).closest('#customer-form-wrapper').length) {
            hideCustomerForm();
            return;
        }

        $(this).closest('.m365-modal, .kbbm-modal-overlay').fadeOut();
    });
    
    // סגירת Modal בלחיצה על הרקע
    $('.m365-modal, .kbbm-modal-overlay').on('click', function(e) {
        if ($(e.target).hasClass('m365-modal') || $(e.target).hasClass('kbbm-modal-overlay')) {
            $(this).fadeOut();
        }
    });

    $('#kbbm-log-settings-form').on('submit', function(e) {
        e.preventDefault();

        const days = parseInt($('#kbbm-log-retention-days').val(), 10) || 120;
        const useTestServer = $('#kbbm-use-test-server').is(':checked') ? 1 : 0;
        const secretAlertRed = parseInt($('#kbbm-secret-alert-red').val(), 10) || 15;
        const secretAlertYellow = parseInt($('#kbbm-secret-alert-yellow').val(), 10) || 45;
        const licenseChangeStartDay = parseInt($('#kbbm-license-change-start-day').val(), 10) || 1;

        $.post(m365Ajax.ajaxurl, {
            action: 'kbbm_save_settings',
            nonce: m365Ajax.nonce,
            log_retention_days: days,
            use_test_server: useTestServer,
            secret_alert_red_days: secretAlertRed,
            secret_alert_yellow_days: secretAlertYellow,
            license_change_start_day: licenseChangeStartDay
        }, function(response) {
            if (response && response.success) {
                showMessage('success', (response.data && response.data.message) ? response.data.message : 'ההגדרות נשמרו');
            } else {
                const msg = response && response.data && response.data.message ? response.data.message : 'שמירת הגדרות נכשלה';
                showMessage('error', msg);
            }
        }).fail(function() {
            showMessage('error', 'שגיאה בשמירת ההגדרות');
        });
    });

    const logTable = $('.kbbm-log-table');
    if (logTable.length) {
        const logHeaders = logTable.find('th.sortable');
        const logSearch = $('#kbbm-log-search-input');
        const logFilters = $('.kbbm-log-filter');
        const columnFilters = [];
        const headerToggles = logTable.find('.kbbm-log-filter-toggle');
        let sortState = { index: 0, dir: 'desc' };

        logHeaders.each(function() {
            const header = $(this);
            const columnIndex = header.index();
            const select = $('<select class="kbbm-log-column-filter"><option value="">הכל</option></select>');

            logTable.find('tbody tr').each(function() {
                const value = $(this).children('td').eq(columnIndex).text().trim();
                if (value && select.find('option').filter(function() { return $(this).val() === value; }).length === 0) {
                    const option = $('<option></option>').attr('value', value).text(value);
                    select.append(option);
                }
            });

            const filterWrapper = $('<div class="kbbm-log-header-filter"></div>').append(select);
            header.append(filterWrapper);
            columnFilters.push(select);
        });

        function applyLogFilters() {
            const searchTerm = (logSearch.val() || '').toLowerCase();
            logTable.find('tbody tr').each(function() {
                const row = $(this);
                const cells = row.children('td');
                const textMatch = !searchTerm || row.text().toLowerCase().indexOf(searchTerm) !== -1;
                let filtersMatch = true;

                logFilters.each(function() {
                    const value = $(this).val();
                    const field = $(this).data('field');
                    if (!value) return;

                    const dataVal = (row.data(field) || '').toString();
                    if (field === 'tenant_domain') {
                        if (dataVal.toLowerCase() !== value.toLowerCase()) {
                            filtersMatch = false;
                            return false;
                        }
                    } else if (field === 'customer') {
                        if (String(row.data('customer')) !== String(value)) {
                            filtersMatch = false;
                            return false;
                        }
                    } else if (dataVal.toLowerCase() !== value.toLowerCase()) {
                        filtersMatch = false;
                        return false;
                    }
                });

                if (filtersMatch) {
                    columnFilters.forEach(function(select, idx) {
                        if (!filtersMatch) return;
                        const filterVal = select.val();
                        if (!filterVal) return;

                        const cellText = (cells.eq(idx).text() || '').trim();
                        if (cellText !== filterVal) {
                            filtersMatch = false;
                        }
                    });
                }

                row.toggle(textMatch && filtersMatch);
            });
        }

        function sortLogTable(columnIndex) {
            const tbody = logTable.find('tbody');
            const rows = tbody.find('tr').get();
            const newDir = (sortState.index === columnIndex && sortState.dir === 'asc') ? 'desc' : 'asc';
            sortState = { index: columnIndex, dir: newDir };

            rows.sort(function(a, b) {
                const cellA = $(a).children('td').eq(columnIndex);
                const cellB = $(b).children('td').eq(columnIndex);
                const valA = (cellA.data('sort-value') || cellA.text()).toString().toLowerCase();
                const valB = (cellB.data('sort-value') || cellB.text()).toString().toLowerCase();

                if (valA < valB) return newDir === 'asc' ? -1 : 1;
                if (valA > valB) return newDir === 'asc' ? 1 : -1;
                return 0;
            });

            tbody.append(rows);
        }

        logHeaders.on('click', function(event) {
            if ($(event.target).closest('.kbbm-log-header-filter, .kbbm-log-filter-toggle').length) {
                return;
            }
            sortLogTable($(this).index());
            applyLogFilters();
        });

        headerToggles.on('click keydown', function(event) {
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const th = $(this).closest('th');
            const isOpen = th.hasClass('filter-open');
            logHeaders.removeClass('filter-open');
            th.toggleClass('filter-open', !isOpen);

            const select = th.find('.kbbm-log-header-filter select');
            if (!isOpen && select.length) {
                select.focus();
            }
        });

        logSearch.on('input', applyLogFilters);
        logFilters.on('change', applyLogFilters);
        columnFilters.forEach(function(filter) {
            filter.on('change', applyLogFilters);
        });
    }
    
    // פונקציית עזר - הצגת הודעה
    function showMessage(type, message) {
        const messageDiv = $('#sync-message');
        messageDiv.removeClass('success error')
                  .addClass(type)
                  .text(message)
                  .fadeIn();

        setTimeout(function() {
            messageDiv.fadeOut();
        }, 5000);
    }

    function updateStatus(el, status, message) {
        if (!el || !el.length) return;

        el.removeClass('status-connected status-failed status-unknown')
          .addClass('status-' + status)
          .text(statusLabel(status, message));

        if (message) {
            el.attr('title', message);
        }
    }

    function statusLabel(status, message) {
        switch (status) {
            case 'connected':
                return 'מחובר';
            case 'failed':
                return message ? 'נכשל: ' + message : 'נכשל';
            default:
                return 'לא נבדק';
        }
    }
    
});

/* KBBM TENANTS UI (single clean implementation, ES5, aggressive cleanup) */
(function(){
  function byId(id){ return document.getElementById(id); }

  function parseTenantText(text){
    text = (text || '').replace(/\r/g, '');
    function pick(re){
      var m = re.exec(text);
      return (m && m[1]) ? (''+m[1]).trim() : '';
    }
    var tenantId = pick(/Tenant\s*ID\s*:\s*([0-9a-fA-F-]{36})/i);
    var clientId = pick(/Application\s*\(Client\)\s*ID\s*:\s*([0-9a-fA-F-]{36})/i) || pick(/Client\s*ID\s*:\s*([0-9a-fA-F-]{36})/i);
    var clientSecret = pick(/Client\s*Secret\s*:\s*([^\n]+)/i);
    if (clientSecret) clientSecret = (''+clientSecret).replace(/\s+/g, '').trim();
    var tenantDomain = pick(/Tenant\s*Domain\s*:\s*([^\n]+)/i);
    return { tenantId: tenantId, clientId: clientId, clientSecret: clientSecret, tenantDomain: tenantDomain };
  }

  function getTenantsFromHidden(){
    var hid = byId('customer-tenants-json');
    if (!hid) return [];
    var v = (hid.value || '').trim();
    if (!v) return [];
    try {
      var arr = JSON.parse(v);
      return Array.isArray(arr) ? arr : [];
    } catch(e){
      return [];
    }
  }

  function setHiddenFromCards(){
    var hid = byId('customer-tenants-json');
    if (!hid) return;
    var container = byId('additional-tenants');
    if (!container) { hid.value = '[]'; return; }
    var cards = container.getElementsByClassName('kbbm-tenant-card');
    var list = [];
    var i;
    for (i=0;i<cards.length;i++){
      var c = cards[i];
      var t = {
        tenant_id: (c.querySelector('.kbbm-tenant-id')||{}).value || '',
        tenant_domain: (c.querySelector('.kbbm-tenant-domain')||{}).value || '',
        client_id: (c.querySelector('.kbbm-tenant-client-id')||{}).value || '',
        client_secret: (c.querySelector('.kbbm-tenant-client-secret')||{}).value || ''
      };
      if ((t.tenant_id+t.tenant_domain+t.client_id+t.client_secret).replace(/\s/g,'') !== '') list.push(t);
    }
    hid.value = JSON.stringify(list);
  }

  function clearContainerHard(){
    var container = byId('additional-tenants');
    if (!container) return;
    // remove ALL children (legacy + new) then re-render from hidden JSON
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  function makeField(label, cls, placeholder){
    return '' +
      '<div class="kb-fortis-field">' +
        '<label>' + label + '</label>' +
        '<input type="text" class="' + cls + '" placeholder="' + (placeholder||'') + '">' +
      '</div>';
  }

  function buildCard(idx){
    var card = document.createElement('div');
    card.className = 'kbbm-tenant-card';
    card.innerHTML =
      '<div class="kbbm-tenant-card-header">' +
        '<div class="kbbm-tenant-card-title">טננט נוסף #' + idx + '</div>' +
        '<button type="button" class="m365-btn m365-btn-small kbbm-tenant-remove">הסר</button>' +
      '</div>' +
      '<div class="kb-fortis-field kbbm-tenant-paste">' +
        '<label>הדבקת פרטי טננט</label>' +
        '<textarea class="kbbm-tenant-paste-src" placeholder="Tenant ID / Application (Client) ID / Client Secret"></textarea>' +
        '<div class="kbbm-tenant-actions">' +
          '<button type="button" class="m365-btn m365-btn-small kbbm-tenant-paste-fill">מלא שדות מהטקסט</button>' +
        '</div>' +
      '</div>' +
      '<div class="kbbm-tenant-grid">' +
        makeField('Tenant ID','kbbm-tenant-id','xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx') +
        makeField('Tenant Domain','kbbm-tenant-domain','example.onmicrosoft.com') +
        makeField('Client ID','kbbm-tenant-client-id','xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx') +
        makeField('Client Secret','kbbm-tenant-client-secret','') +
      '</div>';
    return card;
  }

  function wireCard(container, card){
    var removeBtn = card.querySelector('.kbbm-tenant-remove');
    removeBtn.onclick = function(){
      try { container.removeChild(card); } catch(e){}
      // re-number titles
      var cards = container.getElementsByClassName('kbbm-tenant-card');
      var i;
      for (i=0;i<cards.length;i++){
        var title = cards[i].querySelector('.kbbm-tenant-card-title');
        if (title) title.textContent = 'טננט נוסף #' + (i+1);
      }
      setHiddenFromCards();
    };

    var fillBtn = card.querySelector('.kbbm-tenant-paste-fill');
    fillBtn.onclick = function(){
      var txt = (card.querySelector('.kbbm-tenant-paste-src')||{}).value || '';
      var p = parseTenantText(txt);
      if (p.tenantId) card.querySelector('.kbbm-tenant-id').value = p.tenantId;
      if (p.tenantDomain) card.querySelector('.kbbm-tenant-domain').value = p.tenantDomain;
      if (p.clientId) card.querySelector('.kbbm-tenant-client-id').value = p.clientId;
      if (p.clientSecret) card.querySelector('.kbbm-tenant-client-secret').value = p.clientSecret;
      setHiddenFromCards();
    };

    var inputs = card.querySelectorAll('input,textarea');
    var i;
    for (i=0;i<inputs.length;i++){
      inputs[i].oninput = setHiddenFromCards;
      inputs[i].onchange = setHiddenFromCards;
    }
  }

  function renderFromHidden(){
    var container = byId('additional-tenants');
    if (!container) return;
    clearContainerHard();
    var tenants = getTenantsFromHidden();
    var i;
    for (i=0;i<tenants.length;i++){
      var card = buildCard(i+1);
      container.appendChild(card);
      wireCard(container, card);
      // fill values
      if (tenants[i].tenant_id) card.querySelector('.kbbm-tenant-id').value = tenants[i].tenant_id;
      if (tenants[i].tenant_domain) card.querySelector('.kbbm-tenant-domain').value = tenants[i].tenant_domain;
      if (tenants[i].client_id) card.querySelector('.kbbm-tenant-client-id').value = tenants[i].client_id;
      if (tenants[i].client_secret) card.querySelector('.kbbm-tenant-client-secret').value = tenants[i].client_secret;
    }
    setHiddenFromCards();
  }

  function addTenantCard(){
    var container = byId('additional-tenants');
    if (!container) return;
    // ensure legacy is gone
    // do NOT clear existing cards; just append
    var idx = container.getElementsByClassName('kbbm-tenant-card').length + 1;
    var card = buildCard(idx);
    container.appendChild(card);
    wireCard(container, card);
    setHiddenFromCards();
  }

  function hardRebindButton(){
    var btn = byId('add-tenant-row');
    if (!btn) return;
    // Replace node to remove any legacy event listeners
    if (!btn.__kbbmReplaced){
      var clone = btn.cloneNode(true);
      clone.__kbbmReplaced = true;
      btn.parentNode.replaceChild(clone, btn);
      btn = clone;
    }
    if (!btn.__kbbmBound){
      btn.__kbbmBound = true;
      btn.onclick = addTenantCard;
    }
  }

  function bind(){
    hardRebindButton();
    renderFromHidden();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  setTimeout(bind, 300);
  setTimeout(bind, 1200);
})();
