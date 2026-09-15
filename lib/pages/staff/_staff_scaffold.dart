import 'package:flutter/material.dart';
import '../../staff_session.dart';

const staffBrandBlue = Color(0xFF2563EB);

/// Shared shell for every Staff Mode sub-screen: a back button, a title, and
/// scrollable content — plus resetting the inactivity timer on any tap.
class StaffScaffold extends StatelessWidget {
  const StaffScaffold({
    super.key,
    required this.title,
    required this.onBack,
    required this.children,
    this.actions,
  });

  final String title;
  final VoidCallback onBack;
  final List<Widget> children;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFF8FAFC),
      child: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () => StaffSession.instance.noteActivity(),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 10, 16, 0),
                child: Row(
                  children: [
                    IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    ),
                    ...?actions,
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
