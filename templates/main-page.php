<?php
if (!defined('ABSPATH')) exit;

$portal_urls  = function_exists('kbbm_get_portal_urls') ? kbbm_get_portal_urls() : array();
$main_url     = $portal_urls['main'] ?? 'https://kb.macomp.co.il/?page_id=14296';
$recycle_url  = $portal_urls['recycle'] ?? 'https://kb.macomp.co.il/?page_id=14291';
$settings_url = $portal_urls['settings'] ?? 'https://kb.macomp.co.il/?page_id=14292';
$logs_url     = $portal_urls['logs'] ?? 'https://kb.macomp.co.il/?page_id=14285';
$alerts_url   = $portal_urls['alerts'] ?? 'https://kb.macomp.co.il/?page_id=14290';
$active       = isset($active) ? $active : '';
$secret_alert_red_days = (int) get_option('kbbm_secret_alert_red_days', 15);
$secret_alert_yellow_days = (int) get_option('kbbm_secret_alert_yellow_days', 45);
$license_change_start_day = (int) get_option('kbbm_license_change_start_day', 1);
$license_change_start_date = M365_LM_Database::get_license_change_start_date($license_change_start_day);
$license_change_summary = M365_LM_Database::get_license_change_summary($license_change_start_date);
$customers_by_id = array();

// Billing period input removed from header per user request; keep defaults for downstream use if present
$current_billing_period = isset($_GET['billing_period']) ? sanitize_text_field(wp_unslash($_GET['billing_period'])) : '';
$billing_period_label = $current_billing_period !== '' ? $current_billing_period : '';

$grouped_customers = array();
$types_by_sku      = array();
$paying_customers = array();
$self_paying_customers = array();

if (!empty($customers)) {
    foreach ($customers as $customer) {
        $customers_by_id[$customer->id] = $customer;
    }
}

if (!empty($license_types)) {
    foreach ($license_types as $type) {
        if (!empty($type->sku)) {
            $types_by_sku[$type->sku] = $type;
        }
    }
}

if (!empty($licenses)) {
    foreach ($licenses as $license) {
        $cid = isset($license->customer_id) ? $license->customer_id : $license->customer_number;

        $sku_key = isset($license->sku_id) ? $license->sku_id : '';
        $type    = (!empty($sku_key) && isset($types_by_sku[$sku_key])) ? $types_by_sku[$sku_key] : null;

        if ($type && isset($type->show_in_main) && intval($type->show_in_main) === 0) {
            continue;
        }

        $display_plan_name = $license->plan_name;
        if ($type) {
            if (!empty($type->display_name)) {
                $display_plan_name = $type->display_name;
            } elseif (!empty($type->name)) {
                $display_plan_name = $type->name;
            }
        }

        $license->display_plan_name = $display_plan_name;

        if (!isset($grouped_customers[$cid])) {
            $grouped_customers[$cid] = array(
                'customer_number' => $license->customer_number ?? '',
                'customer_name'   => $license->customer_name ?? '',
                'tenant_domain'   => $license->tenant_domain ?? '',
                'tenant_domains'  => array(),
                'licenses'        => array(),
            );
        }

        $domain_key = isset($license->tenant_domain) && $license->tenant_domain !== '' ? $license->tenant_domain : __('לא צוין', 'm365-license-manager');
        if (!isset($grouped_customers[$cid]['tenant_domains'][$domain_key])) {
            $grouped_customers[$cid]['tenant_domains'][$domain_key] = array(
                'purchased' => 0,
                'charges'   => 0,
            );
        }

        $grouped_customers[$cid]['licenses'][] = $license;
    }
}

if (!empty($customers)) {
    foreach ($customers as $customer) {
        $cid = $customer->id;
        if (!isset($grouped_customers[$cid])) {
            $grouped_customers[$cid] = array(
                'customer_number' => $customer->customer_number ?? '',
                'customer_name'   => $customer->customer_name ?? '',
                'tenant_domain'   => $customer->tenant_domain ?? '',
                'tenant_domains'  => array(),
                'licenses'        => array(),
            );
        }
    }
}

foreach ($grouped_customers as $cid => $customer) {
    $customer_details = $customers_by_id[$cid] ?? null;
    $is_self_paying = $customer_details && !empty($customer_details->is_self_paying);
    if ($is_self_paying) {
        $self_paying_customers[$cid] = $customer;
    } else {
        $paying_customers[$cid] = $customer;
    }
}

$render_customer_table = function($title, $customers_group) use ($billing_period_label, $customers_by_id, $secret_alert_red_days, $secret_alert_yellow_days, $license_change_summary, $license_change_start_date, $types_by_sku) {
    ?>
    <h3 class="kbbm-section-title"><?php echo esc_html($title); ?></h3>
    <div class="m365-table-wrapper">
        <table class="m365-table kbbm-report-table">
            <thead>
                <tr class="customer-header-row">
                    <th>מספר לקוח</th>
                    <th>שם לקוח</th>
                    <th>Tenant Domain</th>
                    <th>סה"כ נרכש</th>
                    <th>סה"כ בשימוש</th>
                    <th>סה"כ פנוי</th>
                    <th>נרכש</th>
                    <th>זוכה</th>
                    <th>ת. חיוב</th>
                    <th>חודשי/שנתי</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($customers_group)): ?>
                <tr>
                    <td colspan="10" class="kbbm-no-data">אין נתונים להצגה. בצע סנכרון ראשוני.</td>
                </tr>
            <?php else: ?>
                <?php foreach ($customers_group as $cid => $customer): ?>
                    <?php
                        $total_charges = 0;
                        $customer_notes = '';
                        $total_purchased_sum = 0;
                        $total_consumed_sum = 0;
                        $total_available_sum = 0;
                        $billing_cycle_display = '';
                        $renewal_date_display = '';
                        foreach ($customer['licenses'] as $license) {
                            $sku_key = isset($license->sku_id) ? $license->sku_id : '';
                            $type = (!empty($sku_key) && isset($types_by_sku[$sku_key])) ? $types_by_sku[$sku_key] : null;
                            $effective_selling = $license->selling_price;
                            $effective_cost = $license->cost_price;
                            if ($type && isset($type->selling_price)) {
                                $effective_selling = $type->selling_price;
                            }
                            if ($type && isset($type->cost_price)) {
                                $effective_cost = $type->cost_price;
                            }
                            $total_purchased = ($license->quantity > 0) ? $license->quantity : $license->enabled_units;
                            $total_charges  += $total_purchased * $effective_selling;
                            $total_purchased_sum += $total_purchased;
                            $total_consumed_sum += $license->consumed_units;
                            $total_available_sum += ($total_purchased - $license->consumed_units);
                            $domain_key = isset($license->tenant_domain) && $license->tenant_domain !== '' ? $license->tenant_domain : __('לא צוין', 'm365-license-manager');
                            if (!isset($customer['tenant_domains'][$domain_key])) {
                                $customer['tenant_domains'][$domain_key] = array('purchased' => 0, 'charges' => 0);
                            }
                            $customer['tenant_domains'][$domain_key]['purchased'] += $total_purchased;
                            $customer['tenant_domains'][$domain_key]['charges']   += $total_purchased * $effective_selling;
                            if (empty($customer_notes) && !empty($license->notes)) {
                                $customer_notes = $license->notes;
                            }

                            if (!empty($license->billing_cycle)) {
                                $current_cycle = $license->billing_cycle;
                                if (!empty($license->billing_frequency)) {
                                    $current_cycle .= ' / ' . $license->billing_frequency;
                                }
                                if ($billing_cycle_display === '') {
                                    $billing_cycle_display = $current_cycle;
                                } elseif ($billing_cycle_display !== $current_cycle) {
                                    $billing_cycle_display = 'מעורב';
                                }
                            }

                            if (!empty($license->renewal_date)) {
                                if ($renewal_date_display === '' || $license->renewal_date < $renewal_date_display) {
                                    $renewal_date_display = $license->renewal_date;
                                }
                            }
                        }

                        $customer_details = $customers_by_id[$cid] ?? null;
                        $secret_expiry = $customer_details->client_secret_expires_at ?? '';
                        $secret_label = 'לא הוגדר';
                        $secret_class = 'kbbm-secret-expiry';
                        if (!empty($secret_expiry)) {
                            $timezone = wp_timezone();
                            $today = new DateTime('now', $timezone);
                            $today->setTime(0, 0, 0);
                            $expiry = new DateTime($secret_expiry, $timezone);
                            $days_remaining = (int) $today->diff($expiry)->format('%r%a');
                            if ($days_remaining < 0) {
                                $secret_label = 'פג תוקף';
                                $secret_class .= ' is-expired';
                            } else {
                                $secret_label = sprintf('נותרו %d ימים', $days_remaining);
                                if ($days_remaining <= $secret_alert_red_days) {
                                    $secret_class .= ' is-danger';
                                } elseif ($days_remaining <= $secret_alert_yellow_days) {
                                    $secret_class .= ' is-warning';
                                }
                            }
                        }

                        $change_summary = $license_change_summary[$cid] ?? array('purchased' => 0, 'credited' => 0);
                        $change_label = 'אין שינויים';
                        if ($change_summary['purchased'] || $change_summary['credited']) {
                            $change_label = sprintf('נרכש: %d | זוכה: %d', $change_summary['purchased'], $change_summary['credited']);
                        }
                        $change_range_label = sprintf('מאז %s', date_i18n('d.m.Y', strtotime($license_change_start_date)));
                        $customer_name = wp_unslash($customer['customer_name']);
                        $billing_cycle_display = $billing_cycle_display !== '' ? $billing_cycle_display : '-';
                        $renewal_date_display = $renewal_date_display !== '' ? $renewal_date_display : '-';
                    ?>
                    <?php
                        $has_customer_number = !empty($customer['customer_number']);
                        $has_customer_name   = !empty($customer['customer_name']);
                        $has_tenant_domain   = !empty($customer['tenant_domains']);
                    ?>
                    <tr class="customer-summary" data-customer="<?php echo esc_attr($cid); ?>">
                        <td class="<?php echo $has_customer_number ? '' : 'kbbm-empty-summary'; ?>"><?php echo $has_customer_number ? esc_html($customer['customer_number']) : ''; ?></td>
                        <td class="<?php echo $has_customer_name ? '' : 'kbbm-empty-summary'; ?>">
                            <?php if ($has_customer_name): ?>
                                <?php echo esc_html($customer_name); ?>
                                <div class="kbbm-customer-alerts">
                                    <span class="<?php echo esc_attr($secret_class); ?>">תוקף מפתח הצפנה: <?php echo esc_html($secret_label); ?></span>
                                    <span class="kbbm-license-change-alert">שינויי רישוי: <?php echo esc_html($change_label); ?></span>
                                    <span class="kbbm-license-change-range"><?php echo esc_html($change_range_label); ?></span>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td class="<?php echo $has_tenant_domain ? '' : 'kbbm-empty-summary'; ?>">
                            <?php if ($has_tenant_domain): ?>
                                <?php foreach ($customer['tenant_domains'] as $domain => $tenant_totals): ?>
                                    <div class="kbbm-tenant-summary">
                                        <strong><?php echo esc_html($domain); ?></strong>
                                        <span>(<?php echo esc_html($tenant_totals['purchased']); ?> רשיונות)</span>
                                    </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </td>
                        <td><?php echo esc_html($total_purchased_sum); ?></td>
                        <td><?php echo esc_html($total_consumed_sum); ?></td>
                        <td><?php echo esc_html($total_available_sum); ?></td>
                        <td><?php echo esc_html($change_summary['purchased'] ?? 0); ?></td>
                        <td><?php echo esc_html($change_summary['credited'] ?? 0); ?></td>
                        <td><?php echo esc_html($renewal_date_display); ?></td>
                        <td><?php echo esc_html($billing_cycle_display); ?></td>
                    </tr>
                    <tr class="plans-header-row detail-row" data-customer="<?php echo esc_attr($cid); ?>" style="display:none;">
                        <th>תוכנית ללקוח</th>
                        <th>מק"ט</th>
                        <th>פריט</th>
                        <th>מחיר ללקוח</th>
                        <th>מחיר רכישה</th>
                        <th>סה"כ נרכש</th>
                        <th>סה"כ בשימוש</th>
                        <th>סה"כ פנוי</th>
                        <th>ת. חיוב</th>
                        <th>חודשי/שנתי</th>
                    </tr>
                    <?php if (empty($customer['licenses'])): ?>
                        <tr class="license-row detail-row" style="display:none;" data-customer="<?php echo esc_attr($cid); ?>">
                            <td colspan="10" class="kbbm-no-data">אין רישיונות להצגה</td>
                        </tr>
                    <?php endif; ?>
                    <?php foreach ($customer['licenses'] as $license): ?>
                        <?php
                            $sku_key = isset($license->sku_id) ? $license->sku_id : '';
                            $type = (!empty($sku_key) && isset($types_by_sku[$sku_key])) ? $types_by_sku[$sku_key] : null;
                            $priority_sku = $type && !empty($type->priority_sku) ? $type->priority_sku : $license->sku_id;
                            $priority_name = $type && !empty($type->priority_name) ? $type->priority_name : $license->plan_name;
                            $total_purchased = ($license->quantity > 0) ? $license->quantity : $license->enabled_units;
                            $available = $total_purchased - $license->consumed_units;
                            $billing_display = $license->billing_cycle;
                            if (!empty($license->billing_frequency)) {
                                $billing_display .= ' / ' . $license->billing_frequency;
                            }
                            $plan_display = isset($license->display_plan_name) ? $license->display_plan_name : $license->plan_name;
                            $selling_price = $license->selling_price;
                            $cost_price = $license->cost_price;
                            if ($type && isset($type->selling_price)) {
                                $selling_price = $type->selling_price;
                            }
                            if ($type && isset($type->cost_price)) {
                                $cost_price = $type->cost_price;
                            }
                        ?>
                        <tr class="license-row detail-row" style="display:none;"
                            data-id="<?php echo esc_attr($license->id); ?>"
                            data-customer="<?php echo esc_attr($cid); ?>"
                            data-billing-cycle="<?php echo esc_attr($license->billing_cycle); ?>"
                            data-billing-frequency="<?php echo esc_attr($license->billing_frequency); ?>"
                            data-quantity="<?php echo esc_attr($license->quantity); ?>"
                            data-enabled="<?php echo esc_attr($license->enabled_units); ?>"
                            data-notes="<?php echo esc_attr($license->notes); ?>"
                        >
                            <td class="plan-name" data-field="plan_name"><?php echo esc_html($plan_display); ?></td>
                            <td data-field="priority_sku"><?php echo esc_html($priority_sku); ?></td>
                            <td data-field="priority_name"><?php echo esc_html($priority_name); ?></td>
                            <td class="editable-price" data-field="selling_price"><?php echo esc_html($selling_price); ?></td>
                            <td class="editable-price" data-field="cost_price"><?php echo esc_html($cost_price); ?></td>
                            <td data-field="total_purchased"><?php echo esc_html($total_purchased); ?></td>
                            <td data-field="consumed_units"><?php echo esc_html($license->consumed_units); ?></td>
                            <td data-field="available_units"><?php echo esc_html($available); ?></td>
                            <td data-field="renewal_date"><?php echo esc_html($license->renewal_date); ?></td>
                            <td data-field="billing_cycle"><?php echo esc_html($billing_display); ?></td>
                        </tr>
                    <?php endforeach; ?>
                    <tr class="kb-notes-row detail-row" data-customer="<?php echo esc_attr($cid); ?>" style="display:none;">
                        <td colspan="10" class="kb-notes-cell">
                            <strong>הערות:</strong>
                            <span class="kb-notes-value"><?php echo esc_html($customer_notes); ?></span>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
            </tbody>
        </table>
    </div>
    <?php
};
?>

<div class="m365-lm-container">
    <?php if (empty($kbbm_single_page)) : ?>
<div class="m365-nav-links">
        <a href="<?php echo esc_url($main_url); ?>" class="<?php echo $active === 'main' ? 'active' : ''; ?>">ראשי</a>
        <a href="<?php echo esc_url($recycle_url); ?>" class="<?php echo $active === 'recycle' ? 'active' : ''; ?>">סל מחזור</a>
        <a href="<?php echo esc_url($settings_url); ?>" class="<?php echo $active === 'settings' ? 'active' : ''; ?>">הגדרות</a>
        <a href="<?php echo esc_url($logs_url); ?>" class="<?php echo $active === 'logs' ? 'active' : ''; ?>">לוגים</a>
        <a href="<?php echo esc_url($alerts_url); ?>" class="<?php echo $active === 'alerts' ? 'active' : ''; ?>">התראות</a>
    </div>
<?php endif; ?>


    <div class="m365-header">
        <div class="m365-header-left">
            <h2>ניהול רישיונות Microsoft 365</h2>
        </div>
        <div class="m365-actions">
            <form method="get" class="kbbm-period-form">
                <label for="kbbm-billing-period">מחזור חיוב</label>
                <input type="text" id="kbbm-billing-period" name="billing_period" value="<?php echo esc_attr($current_billing_period); ?>" placeholder="למשל: אפריל">
                <button type="submit" class="m365-btn m365-btn-secondary">עדכן</button>
            </form>
            <select id="customer-select">
                <option value="">בחר לקוח לסנכרון</option>
                <?php foreach ($customers as $customer): ?>
                    <option value="<?php echo esc_attr($customer->id); ?>">
                        <?php echo esc_html(wp_unslash($customer->customer_name)); ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <button id="sync-licenses" class="m365-btn m365-btn-primary">סנכרון רישיונות</button>
            <button id="sync-all-licenses" class="m365-btn m365-btn-secondary">סנכרון הכל</button>
            <button id="add-customer" class="m365-btn m365-btn-success">הוסף לקוח חדש</button>
        </div>
    </div>

    <div id="sync-message" class="m365-message" style="display:none;"></div>

    <div id="customer-form-placeholder"></div>

    <div id="customer-form-wrapper" class="kbbm-customer-form" style="display:none;">
        <h3 id="customer-modal-title">הוסף לקוח חדש</h3>
        <form id="customer-form">
            <input type="hidden" id="customer-id" name="id">

            <div class="form-group customer-lookup">
                <label>חיפוש לקוח קיים (מהתוסף המרכזי):</label>
                <input type="text" id="customer-lookup" placeholder="התחל להקליד שם או מספר לקוח">
                <div id="customer-lookup-results" class="customer-lookup-results"></div>
                <small class="customer-lookup-hint">הקלד כל חלק מהמחרוזת ולחץ על התוצאה כדי למלא את הטופס.</small>
            </div>

            <div class="form-group">
                <label>מספר לקוח:</label>
                <input type="text" id="customer-number" name="customer_number">
            </div>

            <div class="form-group">
                <label>שם לקוח:</label>
                <input type="text" id="customer-name" name="customer_name">
            </div>

            <div class="form-group">
                <label>Tenant ID:</label>
                <input type="text" id="customer-tenant-id" name="tenant_id">
            </div>

            <div class="form-group">
                <label>Client ID:</label>
                <input type="text" id="customer-client-id" name="client_id">
            </div>

            <div class="form-group">
                <label>Client Secret:</label>
                <input type="password" id="customer-client-secret" name="client_secret">
            </div>

            <div class="form-group">
                <label>תוקף מפתח הצפנה:</label>
                <div class="kbbm-secret-expiry-field">
                    <input type="date" id="customer-secret-expiry" name="client_secret_expires_at">
                    <button type="button" class="m365-btn m365-btn-small m365-btn-secondary kbbm-secret-expiry-plus">+ שנתיים</button>
                </div>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" id="customer-self-paying" name="is_self_paying" value="1">
                    משלם לבד
                </label>
            </div>

            <div class="form-group">
                <label>Tenant Domain:</label>
                <input type="text" id="customer-tenant-domain" name="tenant_domain" placeholder="example.onmicrosoft.com">
            </div>

            <div id="additional-tenants"></div>

            <div class="form-group">
                <button type="button" id="add-tenant-row" class="m365-btn m365-btn-small">
                    הוסף טננט נוסף
                </button>
            </div>

            <input type="hidden" id="customer-tenants-json" name="tenants" value="[]">

            <div class="form-group">
                <label>הדבקת תוצאות סקריפט/חיבור:</label>
                <textarea id="customer-paste-source" placeholder="הדבק כאן את ה-Tenant ID, Client ID, Client Secret ועוד..." rows="4"></textarea>
                <button type="button" id="customer-paste-fill" class="m365-btn m365-btn-secondary" style="margin-top:8px;">מלא שדות מהטקסט</button>
            </div>

            <div class="form-actions">
                <button type="submit" class="m365-btn m365-btn-primary">שמור</button>
                <button type="button" id="customer-save-test" class="m365-btn m365-btn-secondary">שמור וסנכרן</button>
                <button type="button" class="m365-btn m365-modal-cancel">ביטול</button>
            </div>
        </form>
    </div>

    <?php $render_customer_table('לקוחות שאנחנו משלמים', $paying_customers); ?>
    <?php $render_customer_table('לקוחות שמשלמים לבד', $self_paying_customers); ?>
</div>

<div id="edit-license-modal" class="m365-modal">
    <div class="m365-modal-content">
        <span class="m365-modal-close">&times;</span>
        <h3>עריכת רישיון</h3>
        <form id="edit-license-form">
            <input type="hidden" id="license-id" name="id">
            <input type="hidden" id="license-customer-id" name="customer_id">
            <div class="form-field">
                <label for="license-plan-name">תוכנית ללקוח</label>
                <input type="text" id="license-plan-name" name="plan_name" required>
            </div>
            <div class="form-field">
                <label for="license-billing-account">חשבון חיוב</label>
                <input type="text" id="license-billing-account" name="billing_account">
            </div>
            <div class="form-field">
                <label for="license-selling">מחיר ללקוח</label>
                <input type="number" step="0.01" id="license-selling" name="selling_price" required>
            </div>
            <div class="form-field">
                <label for="license-cost">מחיר לנו</label>
                <input type="number" step="0.01" id="license-cost" name="cost_price" required>
            </div>
            <div class="form-field">
                <label for="license-quantity">סה"כ נרכש</label>
                <input type="number" id="license-quantity" name="quantity" min="0">
            </div>
            <div class="form-field">
                <label for="license-billing-cycle">מחזור חיוב</label>
                <select id="license-billing-cycle" name="billing_cycle">
                    <option value="monthly">monthly</option>
                    <option value="yearly">yearly</option>
                </select>
            </div>
            <div class="form-field">
                <label for="license-billing-frequency">תדירות חיוב</label>
                <input type="text" id="license-billing-frequency" name="billing_frequency">
            </div>
            <div class="form-field">
                <label for="license-renewal-date">ת. חיוב</label>
                <input type="date" id="license-renewal-date" name="renewal_date">
            </div>
            <div class="form-field">
                <label for="license-notes">הערות</label>
                <textarea id="license-notes" name="notes" rows="3" style="width:100%;"></textarea>
            </div>
            <div class="form-actions">
                <!-- KBBM TENANTS UI SIGNATURE: 2025-12-16 -->
<div id="additional-tenants" style="margin-top:12px"></div>
<div class="form-group" style="margin-top:10px">
    <button type="button" id="add-tenant-row" class="m365-btn m365-btn-small">הוסף טננט נוסף</button>
</div>
<input type="hidden" id="customer-tenants-json" name="tenants" value="[]">
<!-- /KBBM TENANTS UI -->

\1
                <button type="button" class="m365-btn m365-btn-secondary m365-modal-cancel">ביטול</button>
            </div>
        </form>
    </div>
</div>

<?php if (function_exists('kbbm_render_version_footer')) { kbbm_render_version_footer(); } ?>
