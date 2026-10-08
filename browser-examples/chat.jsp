<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ taglib prefix="c" uri="jakarta.tags.core" %>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chat</title>
  <%-- Spring Security example; omit or adapt when using another CSRF framework. --%>
  <meta name="csrf-token" content="<c:out value='${_csrf.token}'/>">
  <meta name="csrf-header" content="<c:out value='${_csrf.headerName}'/>">
</head>
<body>
  <div id="chat" data-endpoint="<c:url value='/api/chat'/>"></div>
  <%-- Supply cspNonce from the server when the application's CSP requires it. --%>
  <script nonce="<c:out value='${cspNonce}'/>" src="<c:url value='/assets/cypherx-chat/widget.min.js'/>"></script>
  <script nonce="<c:out value='${cspNonce}'/>" src="<c:url value='/assets/cypherx-chat/examples/jsp-init.js'/>"></script>
</body>
</html>
