import 'package:flutter/material.dart';

/// In-kiosk Legal screen: operator/business details plus plain-language
/// summaries of the Privacy Policy, Terms & Conditions, Cookie Policy and
/// Refund Policy. The authoritative, full-length texts live in the project
/// repository under `docs/legal/` and are available on request by email.
///
/// Design notes for accessibility:
///  * every section control is a real, focusable [ChoiceChip] with a clear label
///  * headings are exposed to screen readers via [Semantics] `header: true`
///  * body text uses AA-contrast colours on a white surface
class LegalPage extends StatefulWidget {
  final ValueChanged<String> onNavigate;

  const LegalPage({super.key, required this.onNavigate});

  @override
  State<LegalPage> createState() => _LegalPageState();
}

class _LegalPageState extends State<LegalPage> {
  int _selected = 0;

  static const String _effectiveDate = 'Effective 7 September 2026 · Version 1.0';

  static const List<_LegalSection> _sections = [
    _LegalSection(
      id: 'privacy',
      title: 'Privacy Policy',
      body: '''We follow the Data Privacy Act of 2012 (Republic Act No. 10173).

WHAT WE PROCESS
• The document files you upload or scan. These may contain personal or sensitive information, so we protect every file.
• A payment record for each job: an internal reference number, the amount in pesos, the status, and the time. We do NOT store your name, e-mail, phone number, or the contents of your documents.

WHY
To carry out the print, scan, copy, storage, or transfer job you asked for, and to take payment for it. Sensitive documents are processed only with your consent.

HOW LONG WE KEEP FILES
Files are used only to complete your job and are then deleted. Staff also run a scheduled purge — files are kept for no more than 24 hours. Phone-to-kiosk transfer sessions delete themselves automatically after 30 minutes. You can delete a stored file yourself from the Storage screen.

SHARING
Payment is handled by PayMongo Philippines, Inc. on its own secure page under its own privacy policy. We otherwise share data only when the law requires it. We never sell your data and we run no advertising or tracking.

YOUR RIGHTS
You may ask what we hold, correct it, delete it, object to processing, or complain to the National Privacy Commission (privacy.gov.ph). To make a request, e-mail adriancabil12@gmail.com with your reference number.''',
    ),
    _LegalSection(
      id: 'terms',
      title: 'Terms & Conditions',
      body: '''By using this kiosk you agree to these Terms, which are governed by Philippine law.

THE SERVICE
The kiosk lets you print, scan, photocopy, briefly store, and pay for documents on a self-service basis. It is an undergraduate thesis prototype piloted at the University of Cebu – Lapu-Lapu and Mandaue Campus and may be changed or unavailable at any time.

PRICING & PAYMENT
Prices are shown on screen before you pay, in pesos. Payment is processed by PayMongo. Your job starts only after payment is confirmed. If payment is not confirmed in time, the job is cancelled and you are not charged.

YOUR RESPONSIBILITIES
You are responsible for the documents you process. You must not use the kiosk to copy material you have no right to copy (Intellectual Property Code, RA 8293), to reproduce private images of another person without consent (RA 9995), to handle child sexual abuse material (RA 9775), or to create forgeries or other unlawful content. We may refuse or stop a job we reasonably believe is unlawful.

"AS IS"
The kiosk is a prototype provided "as is". Our total liability for a failed job is limited to a refund of what you paid for it. Your statutory consumer rights are not affected.''',
    ),
    _LegalSection(
      id: 'cookies',
      title: 'Cookie / Local-Storage Policy',
      body: '''Do we need a cookie-consent banner? No.

Under the Data Privacy Act and National Privacy Commission guidance, consent is required only for non-essential technologies such as analytics, advertising, or cross-site tracking. This kiosk uses none of those.

We checked the software and found NO Google Analytics, no Meta Pixel, no Mixpanel, Segment, Hotjar, Sentry or any other analytics or telemetry tool; no advertising tags; and no third-party embeds, share widgets, or iframes.

WHAT WE DO STORE
• On the kiosk: a short-lived cache of the job you are currently setting up, cleared when the job finishes or is cancelled.
• In the staff admin console (not used by you): one strictly-necessary sign-in cookie.

PAYMONGO
When you choose to pay, PayMongo's own secure page opens and may set its own strictly-necessary cookies to process the payment. That is covered by PayMongo's policies.

If we ever add analytics or any non-essential storage, we will update this policy and add a proper consent choice before switching it on.''',
    ),
    _LegalSection(
      id: 'refund',
      title: 'Refund Policy',
      body: '''This policy is consistent with the Consumer Act of the Philippines (RA 7394).

YOU CAN GET A FULL REFUND (or a free re-run) IF:
• the printer jammed, ran out of paper or ink, or failed during your job;
• power was lost or the software crashed before your job finished;
• you were charged but got no output or clearly defective output that was not caused by your own file;
• you were charged more than the amount shown, or charged twice for one job.

REFUNDS ARE NOT USUALLY GIVEN IF:
• the output matches your file and the settings you chose, but you are unhappy with your own document;
• you picked the wrong settings and the kiosk printed exactly what you selected (staff may still grant a goodwill re-run during the pilot);
• scanning or photocopying was completed and delivered.

HOW TO CLAIM
Note the reference number on your acknowledgement and e-mail adriancabil12@gmail.com within 7 days with the date, time, amount, and what went wrong — or tell the on-site pilot staff. Approved refunds go back to your original payment method through PayMongo, normally submitted within 3 working days; your bank or e-wallet then takes a few more days to post it. No fee is charged for a valid refund.''',
    ),
    _LegalSection(
      id: 'consent',
      title: 'Before You Submit a Job',
      body: '''To do your job, the kiosk briefly processes the file(s) you provide or scan. Files are used only to complete your job and are deleted afterwards (within 24 hours at the latest). We keep a payment record — reference number, amount, status, time — not your name and not your document's contents.

Payment is handled by PayMongo on its own secure page; we never see your card or e-wallet details. We use no tracking and no analytics.

When you tick the consent box on the payment screen you confirm that:
• you have read the Terms & Conditions, Privacy Policy, and Refund Policy;
• you are allowed to copy the document(s) you are submitting;
• you consent to this processing.

You can stop any time before payment by pressing Cancel — your files are then discarded. After a job, e-mail adriancabil12@gmail.com with your reference number to have any remaining record deleted.

Please do not scan or copy private images of another person without their consent (Anti-Photo and Video Voyeurism Act, RA 9995).''',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final section = _sections[_selected];
    return SingleChildScrollView(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => widget.onNavigate('home'),
                    icon: const Icon(Icons.arrow_back),
                    label: const Text('Back to Home'),
                  ),
                ),
                const SizedBox(height: 12),
                // Centered masthead — reads as a page title rather than a
                // line of text pinned to the edge of a wide, empty row.
                SizedBox(
                  width: double.infinity,
                  child: Column(
                    children: [
                      Semantics(
                        header: true,
                        child: Text(
                          'Legal & Privacy',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                color: const Color(0xFF003D99),
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        _effectiveDate,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: Color(0xFF4B5563)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Operator / business details
                const _OperatorCard(),
                const SizedBox(height: 24),

                // Section selector — focusable, labelled chips
                SizedBox(
                  width: double.infinity,
                  child: Semantics(
                    label: 'Choose a policy to read',
                    container: true,
                    child: Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (var i = 0; i < _sections.length; i++)
                          ChoiceChip(
                            label: Text(_sections[i].title),
                            selected: _selected == i,
                            onSelected: (_) => setState(() => _selected = i),
                            labelStyle: TextStyle(
                              color: _selected == i
                                  ? Colors.white
                                  : const Color(0xFF1F2937),
                              fontWeight: FontWeight.w600,
                            ),
                            selectedColor: const Color(0xFF2563EB),
                            backgroundColor: const Color(0xFFEEF2FF),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // Selected policy
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(
                            section.title,
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SelectableText(
                          section.body,
                          style: const TextStyle(
                            fontSize: 15,
                            height: 1.6,
                            color: Color(0xFF1F2937), // ~13:1 on white
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0F9FF),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFBFDBFE)),
                  ),
                  child: const Text(
                    'These are plain-language summaries. The full policies are kept '
                    'with the project (docs/legal/) and a copy is available by '
                    'e-mail from adriancabil12@gmail.com. Questions or data-privacy '
                    'requests can be sent to the same address.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF1E3A5F), height: 1.5),
                  ),
                ),
                const SizedBox(height: 24),

                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => widget.onNavigate('home'),
                    icon: const Icon(Icons.arrow_back),
                    label: const Text('Back to Home'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OperatorCard extends StatelessWidget {
  const _OperatorCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF003D99), Color(0xFF1E40AF)],
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(20),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.storefront, color: Colors.white, size: 22),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Business / Operator Details',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 12),
          _KV('Service', 'DocuCenter — Self-Service Document Processing Kiosk'),
          _KV('Developer / Operator', 'Charles Adrian L. Cabil'),
          _KV('Contact e-mail', 'adriancabil12@gmail.com'),
          _KV('Data-privacy contact', 'adriancabil12@gmail.com'),
          _KV('Nature', 'Undergraduate thesis prototype, piloted at the '
              'University of Cebu – Lapu-Lapu and Mandaue Campus'),
          _KV('Payment processor', 'PayMongo Philippines, Inc.'),
        ],
      ),
    );
  }
}

class _KV extends StatelessWidget {
  final String k;
  final String v;
  const _KV(this.k, this.v);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            k.toUpperCase(),
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 0.6,
              color: Color(0xFFDBE9F8),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            v,
            style: const TextStyle(fontSize: 14, color: Colors.white, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _LegalSection {
  final String id;
  final String title;
  final String body;
  const _LegalSection({required this.id, required this.title, required this.body});
}
